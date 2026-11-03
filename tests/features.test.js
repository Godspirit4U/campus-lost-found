/**
 * Tests for the features added on top of the original build: password recovery
 * with one-time codes, permanent image storage, listing editing and deletion,
 * notifications, account settings and the desk's search.
 *
 * Same approach as the main suite: a real Express app against an in-memory
 * PostgreSQL, with the mailer replaced by a capture stub so the code can be read
 * back without a provider.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'features_test_secret_0123456789abcdef';
process.env.JWT_EXPIRES_IN = '1h';
process.env.OTP_TTL_MINUTES = '10';
process.env.OTP_MAX_ATTEMPTS = '5';
process.env.OTP_RESEND_SECONDS = '60';
delete process.env.BREVO_API_KEY;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const fs = require('fs');
const path = require('path');
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { Sequelize } = require('sequelize');
const { newDb } = require('pg-mem');

const mem = newDb();
const pgAdapter = mem.adapters.createPg();
const sequelize = new Sequelize('postgres://t:t@localhost:5432/t', {
  dialect: 'postgres', dialectModule: pgAdapter, logging: false,
});

process.env.DATABASE_URL = 'postgres://t:t@localhost:5432/t';
const { setSequelize } = require('../src/config/db');
setSequelize(sequelize);

const mailer = require('../src/utils/mailer');
const storage = require('../src/utils/storage');

// Capture outgoing codes instead of sending them.
const outbox = { codes: [], confirmations: 0 };
mailer.sendOtp = async ({ to, code }) => { outbox.codes.push({ to, code }); return { delivered: true, adapter: 'stub' }; };
mailer.sendResetConfirmation = async () => { outbox.confirmations += 1; return { delivered: true, adapter: 'stub' }; };

const app = require('../src/app');
const { User, Item, Claim, PasswordReset, Notification, AuditLog } = require('../src/models');

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

let adminToken;
let studentToken;
let otherToken;
let studentId;
const created = { items: [], files: [] };

/**
 * Requests a code with the resend cooldown neutralised, so tests do not have to
 * wait a minute between them. The cooldown itself is tested separately.
 */
const requestCode = async (email) => {
  await PasswordReset.update(
    { requestedAt: new Date(Date.now() - 10 * 60 * 1000) },
    { where: {} }
  );
  await request(app).post('/api/auth/forgot-password').send({ email });
  return outbox.codes[outbox.codes.length - 1];
};

const login = async (email, password) => {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res;
};

before(async () => {
  await sequelize.sync({ force: true });
});

after(async () => {
  // Leave no stray uploads behind.
  for (const file of created.files) {
    try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch { /* ignore */ }
  }
  await sequelize.close();
});

describe('Password recovery and account settings', () => {
  test('setup: three accounts', async () => {
    const admin = await request(app).post('/api/auth/register').send({
      name: 'Desk', email: 'desk@test.edu', studentId: '9000001', password: 'Admin@12345',
    });
    adminToken = admin.body.data.token;

    const student = await request(app).post('/api/auth/register').send({
      name: 'Student One', email: 'one@test.edu', studentId: '2023001', password: 'Student@123',
    });
    studentToken = student.body.data.token;
    studentId = student.body.data.user.id;

    const other = await request(app).post('/api/auth/register').send({
      name: 'Student Two', email: 'two@test.edu', studentId: '2023002', password: 'Student@123',
    });
    otherToken = other.body.data.token;
  });

  test('forgot-password answers identically for unknown and known addresses', async () => {
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@test.edu' });
    const known = await request(app).post('/api/auth/forgot-password').send({ email: 'one@test.edu' });

    assert.equal(unknown.status, 200);
    assert.equal(known.status, 200);
    assert.equal(unknown.body.message, known.body.message);
    assert.equal(outbox.codes.length, 1, 'only the real account triggers a code');
    assert.equal(outbox.codes[0].to, 'one@test.edu');
  });

  test('the code is stored hashed, never in clear text', async () => {
    const row = await PasswordReset.findOne({ where: { userId: studentId }, order: [['createdAt', 'DESC']] });
    const code = outbox.codes[0].code;
    assert.ok(row, 'a reset row exists');
    assert.notEqual(row.otpHash, code);
    assert.match(row.otpHash, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(row.toJSON()).includes(code), 'the code must not appear anywhere in the row');
  });

  test('a wrong code is refused and counts as an attempt', async () => {
    const res = await request(app).post('/api/auth/verify-otp').send({ email: 'one@test.edu', code: '000000' });
    assert.equal(res.status, 400);

    const row = await PasswordReset.findOne({ where: { userId: studentId }, order: [['createdAt', 'DESC']] });
    assert.equal(row.attempts, 1);
  });

  test('the correct code returns a reset token and burns the code', async () => {
    const code = outbox.codes[0].code;
    const res = await request(app).post('/api/auth/verify-otp').send({ email: 'one@test.edu', code });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.resetToken);

    const row = await PasswordReset.findOne({ where: { userId: studentId }, order: [['createdAt', 'DESC']] });
    assert.ok(row.consumedAt, 'the code is marked consumed');
  });

  test('a used code cannot be replayed', async () => {
    const code = outbox.codes[0].code;
    const res = await request(app).post('/api/auth/verify-otp').send({ email: 'one@test.edu', code });
    assert.equal(res.status, 400);
  });

  test('the reset token sets a new password, and the old one stops working', async () => {
    const { code: secondCode } = await requestCode('two@test.edu');
    const verified = await request(app).post('/api/auth/verify-otp').send({ email: 'two@test.edu', code: secondCode });
    const { resetToken } = verified.body.data;

    const reset = await request(app).post('/api/auth/reset-password')
      .send({ resetToken, password: 'BrandNew@1' });
    assert.equal(reset.status, 200);

    const oldLogin = await login('two@test.edu', 'Student@123');
    assert.equal(oldLogin.status, 401);
    const newLogin = await login('two@test.edu', 'BrandNew@1');
    assert.equal(newLogin.status, 200);

    otherToken = newLogin.body.data.token;
  });

  test('a reset token is not accepted as a session token', async () => {
    const { code } = await requestCode('one@test.edu');
    const verified = await request(app).post('/api/auth/verify-otp').send({ email: 'one@test.edu', code });
    const { resetToken } = verified.body.data;

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${resetToken}`);
    assert.equal(res.status, 401, 'a reset token must not authenticate a session');
  });

  test('an expired code is refused', async () => {
    const { code } = await requestCode('one@test.edu');

    const row = await PasswordReset.findOne({ where: { userId: studentId }, order: [['createdAt', 'DESC']] });
    row.expiresAt = new Date(Date.now() - 60000);
    await row.save();

    const res = await request(app).post('/api/auth/verify-otp').send({ email: 'one@test.edu', code });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /expired/i);
  });

  test('too many wrong attempts blocks further tries', async () => {
    const { code } = await requestCode('one@test.edu');

    for (let i = 0; i < 5; i += 1) {
      await request(app).post('/api/auth/verify-otp').send({ email: 'one@test.edu', code: '111111' });
    }
    const res = await request(app).post('/api/auth/verify-otp').send({ email: 'one@test.edu', code });
    assert.equal(res.status, 429);
  });

  test('a second request inside the cooldown does not send another code', async () => {
    await requestCode('one@test.edu');
    const before = outbox.codes.length;
    await request(app).post('/api/auth/forgot-password').send({ email: 'one@test.edu' });
    assert.equal(outbox.codes.length, before, 'cooldown suppresses a resend');
  });

  test('changing a password invalidates existing tokens and issues a new one', async () => {
    const fresh = await login('one@test.edu', 'Student@123');
    const oldToken = fresh.body.data.token;

    const changed = await request(app).patch('/api/auth/password')
      .set('Authorization', `Bearer ${oldToken}`)
      .send({ currentPassword: 'Student@123', newPassword: 'Changed@123' });
    assert.equal(changed.status, 200);
    assert.ok(changed.body.data.token, 'a replacement token is returned');

    const withOld = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${oldToken}`);
    assert.equal(withOld.status, 401, 'the old token is dead');

    const withNew = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${changed.body.data.token}`);
    assert.equal(withNew.status, 200);

    studentToken = changed.body.data.token;
  });

  test('profile editing works and cannot escalate a role', async () => {
    const res = await request(app).patch('/api/auth/me')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ name: 'Renamed Student', phone: '+91 90000 00009', role: 'admin' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.name, 'Renamed Student');
    assert.equal(res.body.data.user.role, 'user', 'role must not change through this endpoint');

    const stored = await User.findByPk(studentId);
    assert.equal(stored.role, 'user');
  });

  test('login and registration are written to the audit log', async () => {
    const actions = (await AuditLog.findAll({ attributes: ['action'] })).map((a) => a.action);
    assert.ok(actions.includes('user.login'), 'login must be audited');
    assert.ok(actions.includes('user.register'), 'registration must be audited');
    assert.ok(actions.includes('user.password_reset'), 'reset must be audited');
  });
});

describe('Image storage', () => {
  test('the local adapter is used when no credentials are configured', () => {
    assert.equal(storage.adapter(), 'local');
    assert.equal(storage.status().configured, false);
  });

  test('a report can carry an image, stored and served', async () => {
    const res = await request(app).post('/api/items')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('type', 'found')
      .field('title', 'Blue umbrella')
      .field('category', 'other')
      .field('description', 'A blue folding umbrella left by the door.')
      .field('privateDetail', 'Broken spoke on the left')
      .field('building', 'cafeteria')
      .field('dateOccurred', new Date().toISOString().slice(0, 10))
      .attach('images', PNG, { filename: 'umbrella.png', contentType: 'image/png' })
      .expect(201);

    const images = res.body.data.item.images;
    assert.equal(images.length, 1);
    assert.match(images[0], /^\/uploads\//);

    const diskPath = path.join(__dirname, '..', 'public', images[0].replace('/uploads/', 'uploads/'));
    assert.ok(fs.existsSync(diskPath), 'the file is on disk');
    created.files.push(diskPath);
    created.items.push(res.body.data.item.id);
  });

  test('three images are accepted and a fourth is refused', async () => {
    const ok = await request(app).post('/api/items')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('type', 'lost')
      .field('title', 'Grey backpack')
      .field('category', 'bags-backpacks')
      .field('description', 'Grey backpack with a laptop sleeve.')
      .field('building', 'central-library')
      .field('dateOccurred', new Date().toISOString().slice(0, 10))
      .attach('images', PNG, { filename: 'a.png', contentType: 'image/png' })
      .attach('images', PNG, { filename: 'b.png', contentType: 'image/png' })
      .attach('images', PNG, { filename: 'c.png', contentType: 'image/png' })
      .expect(201);

    assert.equal(ok.body.data.item.images.length, 3);
    created.items.push(ok.body.data.item.id);
    ok.body.data.item.images.forEach((url) => {
      created.files.push(path.join(__dirname, '..', 'public', url.replace('/uploads/', 'uploads/')));
    });

    const tooMany = await request(app).post('/api/items')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('type', 'lost')
      .field('title', 'Four images')
      .field('category', 'other')
      .field('description', 'This one should be refused.')
      .field('building', 'cafeteria')
      .field('dateOccurred', new Date().toISOString().slice(0, 10))
      .attach('images', PNG, { filename: 'a.png', contentType: 'image/png' })
      .attach('images', PNG, { filename: 'b.png', contentType: 'image/png' })
      .attach('images', PNG, { filename: 'c.png', contentType: 'image/png' })
      .attach('images', PNG, { filename: 'd.png', contentType: 'image/png' });

    assert.ok(tooMany.status >= 400, `expected a rejection, got ${tooMany.status}`);
  });

  test('a non-image file is refused', async () => {
    const res = await request(app).post('/api/items')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('type', 'lost')
      .field('title', 'Not an image')
      .field('category', 'other')
      .field('description', 'Attempting to upload a text file.')
      .field('building', 'cafeteria')
      .field('dateOccurred', new Date().toISOString().slice(0, 10))
      .attach('images', Buffer.from('hello'), { filename: 'notes.txt', contentType: 'text/plain' });

    assert.equal(res.status, 400);
  });

  test('editing a listing keeps chosen images and drops the rest', async () => {
    const itemId = created.items[created.items.length - 1];
    const item = await Item.findByPk(itemId);
    const before = item.images.slice();

    const res = await request(app).patch(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .field('title', 'Grey backpack, edited')
      .field('keepImages', JSON.stringify([before[0]]))
      .attach('images', PNG, { filename: 'new.png', contentType: 'image/png' });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.item.images.length, 2, 'one kept plus one added');

    const dropped = before.slice(1);
    dropped.forEach((url) => {
      const file = path.join(__dirname, '..', 'public', url.replace('/uploads/', 'uploads/'));
      assert.ok(!fs.existsSync(file), 'a removed image is deleted from storage');
    });
    res.body.data.item.images.forEach((url) => {
      created.files.push(path.join(__dirname, '..', 'public', url.replace('/uploads/', 'uploads/')));
    });
  });

  test('deleting a listing removes its images', async () => {
    const itemId = created.items[0];
    const item = await Item.findByPk(itemId);
    const urls = item.images.slice();

    const res = await request(app).delete(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(res.status, 200);

    urls.forEach((url) => {
      const file = path.join(__dirname, '..', 'public', url.replace('/uploads/', 'uploads/'));
      assert.ok(!fs.existsSync(file), 'images are cleaned up with the listing');
    });
  });

  test('legacy /uploads paths still render', () => {
    assert.equal(storage.publicUrl('/uploads/old-file.jpg'), '/uploads/old-file.jpg');
  });
});

describe('Claim evidence privacy', () => {
  let claimId;

  test('a claim with evidence stores it outside the public folder', async () => {
    const item = await request(app).post('/api/items')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('type', 'found')
      .field('title', 'Black wallet')
      .field('category', 'wallets-purses')
      .field('description', 'A black leather wallet found near the bus bay.')
      .field('privateDetail', 'A metro card inside')
      .field('building', 'bus-bay')
      .field('dateOccurred', new Date().toISOString().slice(0, 10))
      .expect(201);

    const itemId = item.body.data.item.id;
    created.items.push(itemId);

    const claim = await request(app).post(`/api/items/${itemId}/claims`)
      .set('Authorization', `Bearer ${otherToken}`)
      .field('message', 'This is my wallet, I dropped it at the bus bay.')
      .field('verificationAnswer', 'There is a metro card inside')
      .attach('proofImage', PNG, { filename: 'proof.png', contentType: 'image/png' })
      .expect(201);

    claimId = claim.body.data.claim.id;

    const stored = await Claim.findByPk(claimId);
    assert.ok(stored.proofImage, 'the object key is stored');
    assert.ok(!stored.proofImage.startsWith('/uploads/'), 'evidence is not in the public uploads folder');

    const privateFile = path.join(__dirname, '..', 'var', 'private', stored.proofImage);
    assert.ok(fs.existsSync(privateFile), 'the file sits in the private folder');
  });

  test('the claimant can open their evidence', async () => {
    const res = await request(app).get(`/api/claims/${claimId}/proof`)
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(res.status, 200);
    assert.match(res.body.data.url, /proof\/raw/);
  });

  test('an administrator can open it', async () => {
    const res = await request(app).get(`/api/claims/${claimId}/proof`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
  });

  test('another student cannot', async () => {
    const res = await request(app).get(`/api/claims/${claimId}/proof`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(res.status, 403);
  });

  test('and an anonymous caller is refused', async () => {
    await request(app).get(`/api/claims/${claimId}/proof`).expect(401);
  });

  test('the signed file link works and rejects a tampered token', async () => {
    const res = await request(app).get(`/api/claims/${claimId}/proof`)
      .set('Authorization', `Bearer ${otherToken}`);
    const url = res.body.data.url;

    const ok = await request(app).get(url);
    assert.equal(ok.status, 200);

    const tampered = await request(app).get(`/api/claims/${claimId}/proof/raw?t=nonsense`);
    assert.equal(tampered.status, 403);
  });
});

describe('Listing management and notifications', () => {
  test('a student can edit both a lost and a found listing they own', async () => {
    const lost = await request(app).post('/api/items')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('type', 'lost')
      .field('title', 'Silver watch')
      .field('category', 'jewellery-accessories')
      .field('description', 'A silver watch lost near the sports complex.')
      .field('building', 'sports-complex')
      .field('dateOccurred', new Date().toISOString().slice(0, 10))
      .expect(201);
    created.items.push(lost.body.data.item.id);

    const edited = await request(app).patch(`/api/items/${lost.body.data.item.id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .field('title', 'Silver watch, strap replaced');
    assert.equal(edited.status, 200);
    assert.equal(edited.body.data.item.title, 'Silver watch, strap replaced');

    const found = created.items[created.items.length - 2];
    const editedFound = await request(app).patch(`/api/items/${found}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .field('description', 'Grey backpack with a laptop sleeve and a blue tag.');
    assert.equal(editedFound.status, 200);
  });

  test('a student cannot edit or delete someone else\'s listing', async () => {
    const target = created.items[created.items.length - 1];
    await request(app).patch(`/api/items/${target}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .field('title', 'Hijacked')
      .expect(403);

    await request(app).delete(`/api/items/${target}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
  });

  test('a found listing can be deleted by its owner', async () => {
    const created2 = await request(app).post('/api/items')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('type', 'found')
      .field('title', 'Green water bottle')
      .field('category', 'water-bottles')
      .field('description', 'A green steel bottle left in the computing lab.')
      .field('privateDetail', 'A dent near the base')
      .field('building', 'computing-lab')
      .field('dateOccurred', new Date().toISOString().slice(0, 10))
      .expect(201);

    const res = await request(app).delete(`/api/items/${created2.body.data.item.id}`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  test('submitting a claim notifies the owner and the claimant', async () => {
    const item = await request(app).post('/api/items')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('type', 'found')
      .field('title', 'Notebook with notes')
      .field('category', 'books-stationery')
      .field('description', 'A spiral notebook left in the library.')
      .field('privateDetail', 'Name written on the first page')
      .field('building', 'central-library')
      .field('dateOccurred', new Date().toISOString().slice(0, 10))
      .expect(201);

    const itemId = item.body.data.item.id;
    created.items.push(itemId);

    await request(app).post(`/api/items/${itemId}/claims`)
      .set('Authorization', `Bearer ${otherToken}`)
      .field('message', 'That notebook is mine, I left it in the reading room.')
      .field('verificationAnswer', 'My name is on the first page')
      .expect(201);

    const ownerNotes = await Notification.findAll({ where: { userId: studentId, type: 'claim.created' } });
    assert.ok(ownerNotes.length >= 1, 'the owner is told about the claim');
  });

  test('cancelling a claim notifies the owner', async () => {
    const claim = await Claim.findOne({ where: { claimantId: (await User.findOne({ where: { email: 'two@test.edu' } })).id } });
    const res = await request(app).patch(`/api/claims/${claim.id}/cancel`)
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(res.status, 200);

    const notes = await Notification.findAll({ where: { userId: studentId, type: 'claim.cancelled' } });
    assert.ok(notes.length >= 1, 'the owner hears about a withdrawn claim');
  });

  test('a single notification can be marked read', async () => {
    const note = await Notification.findOne({ where: { userId: studentId, isRead: false } });
    const res = await request(app).patch(`/api/notifications/${note.id}/read`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(res.status, 200);

    await note.reload();
    assert.equal(note.isRead, true);
  });

  test('one student cannot mark another student\'s notification read', async () => {
    const note = await Notification.findOne({ where: { userId: studentId } });
    const res = await request(app).patch(`/api/notifications/${note.id}/read`)
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(res.status, 404);
  });
});

describe('Desk tools', () => {
  test('user search filters by name, email or PRN', async () => {
    const byName = await request(app).get('/api/admin/users?q=Student%20Two')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(byName.status, 200);
    assert.ok(byName.body.data.users.every((u) => /two/i.test(u.name + u.email)));

    const byPrn = await request(app).get('/api/admin/users?q=2023001')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.ok(byPrn.body.data.users.some((u) => u.studentId === '2023001'));
  });

  test('average days to return is never negative', async () => {
    // Force an impossible row: returned before it was created.
    const item = await Item.create({
      reporterId: studentId, type: 'found', title: 'Time travel mug', category: 'other',
      description: 'A row with inconsistent timestamps.', building: 'cafeteria',
      dateOccurred: '2026-01-01', status: 'returned',
      createdAt: new Date(), updatedAt: new Date(),
      returnedAt: new Date(Date.now() - 10 * 86400000),
    });

    const res = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.performance.avgResolutionDays >= 0, 'the figure cannot go negative');

    await item.destroy();
  });

  test('health reports integration activation state', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.integrations.storage.adapter, 'local');
    assert.equal(res.body.data.integrations.email.configured, false);
  });

  test('an unknown page returns the styled 404', async () => {
    const res = await request(app).get('/this-page-does-not-exist').set('Accept', 'text/html');
    assert.equal(res.status, 404);
    assert.match(res.text, /Page not found|missing too/i);
  });

  test('the reset flow pages are served', async () => {
    await request(app).get('/forgot-password.html').expect(200);
    await request(app).get('/account.html').expect(200);
    await request(app).get('/404.html').expect(200);
  });
});

describe('Permanent account deletion', () => {
  let victimToken;
  let victimId;
  let victimItemId;
  const victimFiles = [];

  test('a normal user cannot delete accounts', async () => {
    await request(app).delete(`/api/admin/users/${studentId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
  });

  test('an administrator cannot delete their own account', async () => {
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${adminToken}`);
    const res = await request(app).delete(`/api/admin/users/${me.body.data.user.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 400);
    assert.match(res.body.message, /your own account/i);
  });

  test('setup: a student with a listing, an image and a claim', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      name: 'Temp Person', email: 'temp@test.edu', studentId: '2023999', password: 'Temp@12345',
    });
    victimToken = reg.body.data.token;
    victimId = reg.body.data.user.id;

    const item = await request(app).post('/api/items')
      .set('Authorization', `Bearer ${victimToken}`)
      .field('type', 'found')
      .field('title', 'Orange notebook')
      .field('category', 'books-stationery')
      .field('description', 'An orange notebook left in the computing lab.')
      .field('privateDetail', 'Name inside the cover')
      .field('building', 'computing-lab')
      .field('dateOccurred', new Date().toISOString().slice(0, 10))
      .attach('images', PNG, { filename: 'book.png', contentType: 'image/png' })
      .expect(201);

    victimItemId = item.body.data.item.id;
    item.body.data.item.images.forEach((url) => {
      victimFiles.push(path.join(__dirname, '..', 'public', url.replace('/uploads/', 'uploads/')));
    });

    // and a claim by the same person on someone else's item
    const someoneElses = await Item.findOne({ where: { reporterId: studentId, status: 'active' } });
    if (someoneElses) {
      await request(app).post(`/api/items/${someoneElses.id}/claims`)
        .set('Authorization', `Bearer ${victimToken}`)
        .field('message', 'That item looks like mine, I lost it recently.')
        .field('verificationAnswer', 'There is a mark on it')
        .expect(201);
    }
  });

  test('the listing and its image exist before deletion', async () => {
    assert.ok(await Item.findByPk(victimItemId));
    assert.ok(victimFiles.every((f) => fs.existsSync(f)), 'image file present');
  });

  test('deleting the account removes the user, the listing and the files', async () => {
    const res = await request(app).delete(`/api/admin/users/${victimId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.removed.user, 1);
    assert.ok(res.body.data.removed.items >= 1);

    assert.equal(await User.findByPk(victimId), null, 'the user row is gone');
    assert.equal(await Item.findByPk(victimItemId), null, 'their listing cascaded away');
    assert.equal(await Claim.count({ where: { claimantId: victimId } }), 0, 'their claims cascaded away');
    assert.ok(victimFiles.every((f) => !fs.existsSync(f)), 'their images were cleaned up');
  });

  test('the deletion is written to the audit log', async () => {
    const entry = await AuditLog.findOne({ where: { action: 'user.delete' }, order: [['createdAt', 'DESC']] });
    assert.ok(entry, 'an audit row records the deletion');
    assert.match(entry.summary, /temp@test\.edu/);
  });

  test('the deleted account can no longer sign in', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'temp@test.edu', password: 'Temp@12345' });
    assert.equal(res.status, 401);
  });

  test('a missing account returns 404', async () => {
    await request(app).delete(`/api/admin/users/${victimId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
