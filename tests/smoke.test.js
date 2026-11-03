/**
 * End-to-end API tests. A real Express app is exercised against an in-memory
 * MongoDB, so the suite covers routing, validation, authentication,
 * authorisation and the claim state machine without needing a running database.
 *
 *   npm test
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_do_not_use_in_production_0123456789';
process.env.JWT_EXPIRES_IN = '1h';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { Sequelize } = require('sequelize');
const { newDb } = require('pg-mem');

// An in-memory PostgreSQL instance stands in for Supabase during tests, so the
// suite runs anywhere with no database server and no credentials.
const mem = newDb();
const pgAdapter = mem.adapters.createPg();
const sequelize = new Sequelize('postgres://test:test@localhost:5432/test', {
  dialect: 'postgres',
  dialectModule: pgAdapter,
  logging: false,
});

process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
const { setSequelize } = require('../src/config/db');
setSequelize(sequelize);

const app = require('../src/app');
const { Item } = require('../src/models');
let adminToken;
let studentToken;
let claimerToken;
let itemId;
let claimId;
let pickupCode;
let matchedItemId;

before(async () => {
  await sequelize.sync({ force: true });
});

after(async () => {
  await sequelize.close();
});

describe('Campus Lost and Found API', () => {
  test('1. health endpoint reports a connected database', async () => {
    const res = await request(app).get('/api/health').expect(200);
    assert.equal(res.body.data.database, 'connected');
  });

  test('2. first registration becomes the administrator', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Desk Admin', email: 'admin@test.edu', studentId: '9000001', password: 'Admin@12345',
    }).expect(201);
    assert.equal(res.body.data.user.role, 'admin');
    assert.ok(res.body.data.token);
    assert.equal(res.body.data.user.passwordHash, undefined, 'password hash must never be returned');
    adminToken = res.body.data.token;
  });

  test('3. subsequent registrations are normal users', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Student One', email: 's1@test.edu', studentId: '2023001', password: 'Student@123',
    }).expect(201);
    assert.equal(res.body.data.user.role, 'user');
    studentToken = res.body.data.token;

    const res2 = await request(app).post('/api/auth/register').send({
      name: 'Student Two', email: 's2@test.edu', studentId: '2023002', password: 'Student@123',
    }).expect(201);
    claimerToken = res2.body.data.token;
  });

  test('4. duplicate email is rejected with 409', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Copy Cat', email: 's1@test.edu', studentId: '2023999', password: 'Student@123',
    }).expect(409);
    assert.match(res.body.message, /already exists/i);
  });

  test('5. invalid registration body returns field level errors', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'X', email: 'not-an-email', studentId: 'abc', password: 'short',
    }).expect(400);
    assert.equal(res.body.success, false);
    assert.ok(Array.isArray(res.body.errors) && res.body.errors.length >= 3);
  });

  test('6. wrong password returns 401 with a generic message', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 's1@test.edu', password: 'WrongPass1',
    }).expect(401);
    assert.equal(res.body.message, 'Invalid email or password.');
  });

  test('7. login succeeds and returns a token', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 's1@test.edu', password: 'Student@123',
    }).expect(200);
    assert.ok(res.body.data.token);
    studentToken = res.body.data.token;
  });

  test('8. public listing works without authentication', async () => {
    const res = await request(app).get('/api/items').expect(200);
    assert.ok(Array.isArray(res.body.data.items));
    assert.ok(res.body.data.pagination.total >= 0);
  });

  test('9. creating an item without a token returns 401', async () => {
    const res = await request(app).post('/api/items').field('title', 'No auth').expect(401);
    assert.equal(res.body.success, false);
  });

  test('10. invalid item payload returns 400', async () => {
    const res = await request(app).post('/api/items')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('type', 'lost')
      .field('title', 'ab')
      .field('category', 'not-a-category')
      .expect(400);
    assert.ok(res.body.errors.length > 0);
  });

  test('11. a found item requires a private identifying detail', async () => {
    const res = await request(app).post('/api/items')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('type', 'found')
      .field('title', 'Black wired earphones')
      .field('category', 'electronics')
      .field('description', 'Black wired earphones with a red cable in a white pouch.')
      .field('building', 'central-library')
      .field('dateOccurred', new Date(Date.now() - 3 * 864e5).toISOString())
      .expect(400);
    assert.match(res.body.message, /private identifying detail/i);
  });

  test('12. a valid report is published immediately', async () => {
    const res = await request(app).post('/api/items')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('type', 'found')
      .field('title', 'Black wired earphones')
      .field('category', 'electronics')
      .field('description', 'Black wired earphones with a red cable in a small white pouch.')
      .field('privateDetail', 'Scratch on the right earbud')
      .field('colour', 'black')
      .field('brand', 'boat')
      .field('building', 'central-library')
      .field('locationDetail', 'Reading room table 7')
      .field('dateOccurred', new Date(Date.now() - 3 * 864e5).toISOString())
      .expect(201);

    assert.equal(res.body.data.item.status, 'active');
    itemId = res.body.data.item.id;
  });

  test('13. an item taken down by an admin is invisible to the public', async () => {
    await request(app).patch(`/api/items/${itemId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'pending' })
      .expect(200);

    await request(app).get(`/api/items/${itemId}`).expect(404);

    await request(app).patch(`/api/items/${itemId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'active' })
      .expect(200);
  });

  test('14. a normal user cannot change an item status', async () => {
    await request(app).patch(`/api/items/${itemId}/status`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ status: 'active' })
      .expect(403);
  });

  test('15. an administrator can change a listing status', async () => {
    const res = await request(app).patch(`/api/items/${itemId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'active' })
      .expect(200);
    assert.equal(res.body.data.item.status, 'active');
  });

  test('16. the public detail hides the private detail', async () => {
    const res = await request(app).get(`/api/items/${itemId}`).expect(200);
    assert.equal(res.body.data.item.privateDetail, undefined);
    assert.ok(res.body.data.item.title);
  });

  test('17. the owner sees their own private detail', async () => {
    const res = await request(app).get(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    assert.equal(res.body.data.item.privateDetail, 'Scratch on the right earbud');
  });

  test('18. filters narrow the result set', async () => {
    const res = await request(app)
      .get('/api/items?type=found&category=electronics&building=central-library')
      .expect(200);
    assert.ok(res.body.data.items.every((i) => i.type === 'found' && i.category === 'electronics'));
  });

  test('19. editing someone else\'s item returns 403', async () => {
    await request(app).patch(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${claimerToken}`)
      .send({ title: 'Hijacked title' })
      .expect(403);
  });

  test('20. a user cannot claim their own report', async () => {
    const res = await request(app).post(`/api/items/${itemId}/claims`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ message: 'This is my own item', verificationAnswer: 'scratch' })
      .expect(400);
    assert.match(res.body.message, /cannot claim an item you reported/i);
  });

  test('21. another user can submit a claim', async () => {
    const res = await request(app).post(`/api/items/${itemId}/claims`)
      .set('Authorization', `Bearer ${claimerToken}`)
      .send({
        message: 'These are mine, I left them in the library on Tuesday.',
        verificationAnswer: 'There is a scratch on the right earbud',
      })
      .expect(201);
    claimId = res.body.data.claim.id;
    assert.equal(res.body.data.claim.status, 'pending');
  });

  test('22. a second open claim on the same item is refused', async () => {
    const res = await request(app).post(`/api/items/${itemId}/claims`)
      .set('Authorization', `Bearer ${claimerToken}`)
      .send({ message: 'Trying again with the same account', verificationAnswer: 'scratch' })
      .expect(409);
    assert.match(res.body.message, /already have an open claim/i);
  });

  test('23. a normal user cannot decide a claim', async () => {
    await request(app).patch(`/api/claims/${claimId}`)
      .set('Authorization', `Bearer ${claimerToken}`)
      .send({ action: 'approve' })
      .expect(403);
  });

  test('24. approving a claim reserves the item and issues a pickup code', async () => {
    const res = await request(app).patch(`/api/claims/${claimId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'approve', decisionNote: 'Ownership detail matched.' })
      .expect(200);
    assert.equal(res.body.data.claim.status, 'approved');
    pickupCode = res.body.data.claim.pickupCode;
    assert.ok(pickupCode && pickupCode.length === 6);

    const item = await Item.findByPk(itemId);
    assert.equal(item.status, 'claimed');
  });

  test('25. a claim cannot be submitted on a reserved item', async () => {
    const res = await request(app).post(`/api/items/${itemId}/claims`)
      .set('Authorization', `Bearer ${claimerToken}`)
      .send({ message: 'Late attempt to claim the same thing', verificationAnswer: 'scratch' })
      .expect(400);
    assert.match(res.body.message, /not open to claims/i);
  });

  test('26. a wrong pickup code is refused', async () => {
    await request(app).post(`/api/claims/${claimId}/collect`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pickupCode: 'WRONG1' })
      .expect(400);
  });

  test('27. the correct pickup code closes the case and marks the item returned', async () => {
    await request(app).post(`/api/claims/${claimId}/collect`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pickupCode })
      .expect(200);

    const item = await Item.findByPk(itemId);
    assert.equal(item.status, 'returned');
    assert.ok(item.returnedAt);
  });

  test('28. admin statistics are restricted to administrators', async () => {
    await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${studentToken}`).expect(403);

    const res = await request(app).get('/api/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`).expect(200);
    const { totals, claims, performance } = res.body.data;
    assert.equal(totals.totalFound, 1);
    assert.equal(totals.returned, 1);
    assert.equal(claims.collected, 1);
    assert.equal(performance.recoveryRate, 100);
  });

  test('29. chart data returns the four series', async () => {
    const res = await request(app).get('/api/admin/charts')
      .set('Authorization', `Bearer ${adminToken}`).expect(200);
    assert.ok(Array.isArray(res.body.data.byCategory));
    assert.ok(Array.isArray(res.body.data.byBuilding));
    assert.equal(res.body.data.weeklyTrend.length, 8);
    assert.ok(Array.isArray(res.body.data.claimOutcomes));
  });

  test('30. notifications are created for the claimant', async () => {
    const res = await request(app).get('/api/notifications')
      .set('Authorization', `Bearer ${claimerToken}`).expect(200);
    assert.ok(res.body.data.notifications.length >= 2);
    assert.ok(res.body.data.unreadCount >= 1);

    await request(app).post('/api/notifications/read-all')
      .set('Authorization', `Bearer ${claimerToken}`).expect(200);
    const after = await request(app).get('/api/notifications')
      .set('Authorization', `Bearer ${claimerToken}`).expect(200);
    assert.equal(after.body.data.unreadCount, 0);
  });

  test('31. the audit log records privileged actions', async () => {
    const res = await request(app).get('/api/admin/audit-log')
      .set('Authorization', `Bearer ${adminToken}`).expect(200);
    const actions = res.body.data.logs.map((l) => l.action);
    assert.ok(actions.includes('claim.approve'));
    assert.ok(actions.includes('item.status_change'));
  });

  test('32. the match engine links a lost report to a matching found report', async () => {
    const lost = await request(app).post('/api/items')
      .set('Authorization', `Bearer ${claimerToken}`)
      .field('type', 'lost')
      .field('title', 'Black earphones with red cable')
      .field('category', 'electronics')
      .field('description', 'I lost my black wired earphones with a red cable, kept in a white pouch, in the library.')
      .field('colour', 'black')
      .field('building', 'central-library')
      .field('dateOccurred', new Date(Date.now() - 2 * 864e5).toISOString())
      .expect(201);

    matchedItemId = lost.body.data.item.id;

    await request(app).patch(`/api/items/${matchedItemId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'active' })
      .expect(200);

    // The found item from test 12 was returned, so create a fresh active one.
    const found = await request(app).post('/api/items')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('type', 'found')
      .field('title', 'Earphones found in the library')
      .field('category', 'electronics')
      .field('description', 'Found black wired earphones with a red cable in a white pouch in the reading room.')
      .field('privateDetail', 'Scratch on the right earbud')
      .field('colour', 'black')
      .field('building', 'central-library')
      .field('dateOccurred', new Date(Date.now() - 1 * 864e5).toISOString())
      .expect(201);

    await request(app).patch(`/api/items/${found.body.data.item.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'active' })
      .expect(200);

    const res = await request(app).get(`/api/items/${matchedItemId}/matches`)
      .set('Authorization', `Bearer ${claimerToken}`).expect(200);

    assert.ok(res.body.data.matches.length >= 1, 'expected at least one match');
    const best = res.body.data.matches[0];
    assert.ok(best.score >= 0.55, `score ${best.score} should clear the threshold`);
    assert.ok(best.reasons.length >= 2, 'a match must explain itself');
  });

  test('33. duplicate detection flags same-type reports', async () => {
    const res = await request(app).get('/api/admin/duplicates')
      .set('Authorization', `Bearer ${adminToken}`).expect(200);
    assert.ok(Array.isArray(res.body.data.pairs));
  });

  test('34. an administrator cannot demote their own account', async () => {
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${adminToken}`).expect(200);
    const res = await request(app).patch(`/api/admin/users/${me.body.data.user.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'user' })
      .expect(400);
    assert.match(res.body.message, /cannot demote/i);
  });

  test('35. the frontend pages are served by the same process', async () => {
    const home = await request(app).get('/index.html').expect(200);
    assert.match(home.text, /Campus Lost and Found Portal/);
    await request(app).get('/browse.html').expect(200);
    await request(app).get('/admin.html').expect(200);
    await request(app).get('/css/styles.css').expect(200);
    await request(app).get('/js/api.js').expect(200);
  });

  test('36. an unknown API route returns a JSON 404', async () => {
    const res = await request(app).get('/api/does-not-exist').expect(404);
    assert.equal(res.body.success, false);
  });

  test('37. the seed script builds the demo dataset and a matching pair', async () => {
    const { seed } = require('../src/seed');
    const result = await seed({ close: false, sync: false });

    assert.equal(result.items, 16, 'sixteen sample items are seeded');
    assert.equal(result.users, 3);
    assert.ok(result.matches >= 1, 'the deliberate lost/found pair must be matched');

    const { Match } = require('../src/models');
    const best = await Match.findOne({ order: [['score', 'DESC']] });
    assert.ok(best.score >= 0.55);
    assert.ok(best.reasons.length >= 2);
  });
});
