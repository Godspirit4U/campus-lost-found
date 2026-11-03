/**
 * Image storage.
 *
 * One interface, two adapters:
 *   supabase - objects live in Supabase Storage buckets (survives redeploys)
 *   local    - objects live on disk, for development and for tests
 *
 * The adapter is chosen from the environment, so the application runs with or
 * without credentials. Nothing here uses the Supabase SDK: the storage REST API
 * is a handful of HTTP calls, and adding a dependency for it would be weight
 * without benefit.
 *
 * Buckets:
 *   item-images  public   - listing photos, rendered straight from a public URL
 *   claim-proofs private  - evidence, only served through an authorised route
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOCAL_PUBLIC_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');
const LOCAL_PRIVATE_DIR = path.join(__dirname, '..', '..', 'var', 'private');

const ITEM_BUCKET = () => process.env.SUPABASE_ITEM_BUCKET || 'item-images';
const PROOF_BUCKET = () => process.env.SUPABASE_PROOF_BUCKET || 'claim-proofs';

function configured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function adapter() {
  return configured() ? 'supabase' : 'local';
}

function baseUrl() {
  return String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
}

function authHeaders(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    // Supabase accepts the key as a bearer token (legacy JWT service_role keys)
    // and in the apikey header (the newer sb_secret_ keys). Sending both means
    // either kind works without the operator having to know which they have.
    authorization: `Bearer ${key}`,
    apikey: key,
    ...extra,
  };
}

const EXT_BY_TYPE = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

function makeKey(prefix) {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${prefix}/${stamp}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

function extFor(contentType, originalName = '') {
  if (EXT_BY_TYPE[contentType]) return EXT_BY_TYPE[contentType];
  const ext = path.extname(originalName).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeName(name) {
  return String(name).replace(/[^a-zA-Z0-9/_.-]/g, '');
}

/* -------------------------------------------------------------- upload */
/**
 * @returns {Promise<{path: string, url: string, bucket: string}>}
 * `path` is what gets stored in Postgres. `url` is a renderable address for
 * public objects and null for private ones.
 */
async function put({ bucket, buffer, contentType, originalName, prefix = 'items' }) {
  const key = makeKey(prefix) + extFor(contentType, originalName);

  if (adapter() === 'local') {
    const isPublic = bucket === ITEM_BUCKET();
    const root = isPublic ? LOCAL_PUBLIC_DIR : LOCAL_PRIVATE_DIR;
    const file = path.join(root, key);
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, buffer);
    return { path: key, url: isPublic ? `/uploads/${key}` : null, bucket };
  }

  if (typeof fetch !== 'function') throw new Error('Storage unavailable: fetch is not available in this runtime');

  const res = await fetch(`${baseUrl()}/storage/v1/object/${bucket}/${key}`, {
    method: 'POST',
    headers: authHeaders({ 'content-type': contentType || 'application/octet-stream', 'x-upsert': 'true' }),
    body: buffer,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Storage upload failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const isPublic = bucket === ITEM_BUCKET();
  return { path: key, url: isPublic ? publicUrl(key) : null, bucket };
}

/* --------------------------------------------------------------- remove */
async function remove({ bucket, paths }) {
  const list = (Array.isArray(paths) ? paths : [paths]).filter(Boolean);
  if (!list.length) return { removed: 0 };

  if (adapter() === 'local') {
    let removed = 0;
    for (const key of list) {
      const candidates = [
        path.join(LOCAL_PUBLIC_DIR, key),
        path.join(LOCAL_PRIVATE_DIR, key),
      ];
      for (const file of candidates) {
        if (fs.existsSync(file)) {
          try { fs.unlinkSync(file); removed += 1; } catch { /* ignore */ }
        }
      }
    }
    return { removed };
  }

  if (typeof fetch !== 'function') return { removed: 0 };

  try {
    const res = await fetch(`${baseUrl()}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: authHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ prefixes: list }),
    });
    return { removed: res.ok ? list.length : 0 };
  } catch (err) {
    console.error('[storage] delete failed:', err.message);
    return { removed: 0 };
  }
}

/* ----------------------------------------------------------------- urls */
function publicUrl(key) {
  if (!key) return null;
  if (/^https?:\/\//.test(key)) return key;
  // Legacy rows from before the migration hold "/uploads/..." paths.
  if (key.startsWith('/uploads/')) return key;
  if (adapter() === 'local') return `/uploads/${key}`;
  return `${baseUrl()}/storage/v1/object/public/${ITEM_BUCKET()}/${key}`;
}

/** Time-limited link for a private object. */
async function signedUrl({ bucket = PROOF_BUCKET(), key, expiresIn = 300 }) {
  if (!key) return null;
  if (/^https?:\/\//.test(key)) return key;

  if (adapter() === 'local') return null; // served through the authorised route instead
  if (typeof fetch !== 'function') return null;

  try {
    const res = await fetch(`${baseUrl()}/storage/v1/object/sign/${bucket}/${key}`, {
      method: 'POST',
      headers: authHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ expiresIn }),
    });
    if (!res.ok) return null;
    const body = await res.json();
    if (!body.signedURL) return null;
    return body.signedURL.startsWith('http') ? body.signedURL : `${baseUrl()}/storage/v1${body.signedURL}`;
  } catch (err) {
    console.error('[storage] signing failed:', err.message);
    return null;
  }
}

/** Absolute path of a private object on disk, used by the local adapter's route. */
function localPrivatePath(key) {
  if (!key) return null;
  const clean = safeName(key);
  const file = path.join(LOCAL_PRIVATE_DIR, clean);
  return fs.existsSync(file) ? file : null;
}

function status() {
  return {
    adapter: adapter(),
    configured: configured(),
    itemBucket: ITEM_BUCKET(),
    proofBucket: PROOF_BUCKET(),
    note: configured()
      ? 'Objects are stored in Supabase Storage.'
      : 'Objects are stored on local disk and will not survive a redeploy. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to activate permanent storage.',
  };
}

module.exports = {
  put, remove, publicUrl, signedUrl, localPrivatePath, status,
  ITEM_BUCKET, PROOF_BUCKET, adapter,
};
