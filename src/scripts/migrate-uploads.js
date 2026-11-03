/**
 * Moves images that were written to public/uploads (before permanent storage
 * existed) into the configured storage buckets, then rewrites the database rows
 * to point at the new object keys.
 *
 *   node src/scripts/migrate-uploads.js --dry-run
 *   node src/scripts/migrate-uploads.js
 *
 * Safe to run more than once: rows that already hold a storage key are skipped.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { sequelize, Item, Claim } = require('../models');
const { connectDB } = require('../config/db');
const storage = require('../utils/storage');

const DRY_RUN = process.argv.includes('--dry-run');
const LOCAL_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');

function localFile(key) {
  if (!key || !key.startsWith('/uploads/')) return null;
  const file = path.join(LOCAL_DIR, key.replace('/uploads/', ''));
  return fs.existsSync(file) ? file : null;
}

function contentTypeFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

async function migrateItems() {
  const items = await Item.findAll({ where: {} });
  let moved = 0;
  let missing = 0;

  for (const item of items) {
    const images = Array.isArray(item.images) ? item.images : [];
    if (!images.length) continue;

    const next = [];
    let changed = false;

    for (const key of images) {
      if (!key.startsWith('/uploads/')) { next.push(key); continue; }

      const file = localFile(key);
      if (!file) { missing += 1; next.push(key); continue; }

      if (DRY_RUN) {
        console.log(`would move item ${item.id}: ${key}`);
        next.push(key);
        continue;
      }

      const buffer = fs.readFileSync(file);
      const object = await storage.put({
        bucket: storage.ITEM_BUCKET(),
        buffer,
        contentType: contentTypeFor(file),
        originalName: path.basename(file),
        prefix: 'items',
      });
      next.push(object.path);
      moved += 1;
      changed = true;
    }

    if (changed) await item.update({ images: next });
  }

  return { moved, missing };
}

async function migrateClaims() {
  const claims = await Claim.findAll({ where: {} });
  let moved = 0;

  for (const claim of claims) {
    if (!claim.proofImage || !claim.proofImage.startsWith('/uploads/')) continue;

    const file = localFile(claim.proofImage);
    if (!file) continue;

    if (DRY_RUN) {
      console.log(`would move claim ${claim.id}: ${claim.proofImage}`);
      continue;
    }

    const buffer = fs.readFileSync(file);
    const object = await storage.put({
      bucket: storage.PROOF_BUCKET(),
      buffer,
      contentType: contentTypeFor(file),
      originalName: path.basename(file),
      prefix: 'claims',
    });
    await claim.update({ proofImage: object.path });
    moved += 1;
  }

  return { moved };
}

(async () => {
  await connectDB();

  if (storage.adapter() !== 'supabase') {
    console.log('[migrate] No Supabase credentials configured, so there is nowhere to move files to.');
    console.log('[migrate] Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then run this again.');
    await sequelize.close();
    return;
  }

  console.log(`[migrate] adapter=${storage.adapter()} dryRun=${DRY_RUN}`);
  const items = await migrateItems();
  const claims = await migrateClaims();

  console.log(`[migrate] item images moved: ${items.moved} (missing files: ${items.missing})`);
  console.log(`[migrate] claim proofs moved: ${claims.moved}`);
  await sequelize.close();
})().catch(async (err) => {
  console.error('[migrate] failed:', err.message);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
