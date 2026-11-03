/**
 * Rebuilds the demo dataset. Safe to run repeatedly: it clears the tables it
 * owns and re-inserts everything, so a demo always starts from a known state.
 *
 *   npm run seed
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, User, Item, Claim, Match, Notification, AuditLog } = require('./models');
const { connectDB } = require('./config/db');
const { generateMatchesFor } = require('./utils/match');
const { generatePickupCode } = require('./utils/pickup');

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const dateOnly = (n) => daysAgo(n).toISOString().slice(0, 10);

async function seed({ close = true, sync = true } = {}) {
  await connectDB();
  // sync() is idempotent on a real server; tests skip it because the schema
  // already exists in their in-memory database.
  if (sync) await sequelize.sync();

  // Delete children before parents so foreign keys stay satisfied.
  await Claim.destroy({ where: {} });
  await Match.destroy({ where: {} });
  await Notification.destroy({ where: {} });
  await AuditLog.destroy({ where: {} });
  await Item.destroy({ where: {} });
  await User.destroy({ where: {} });

  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
  const userPassword = process.env.SEED_USER_PASSWORD || 'Student@12345';

  const admin = await User.create({
    name: 'Sivaharsha Sottu',
    email: process.env.SEED_ADMIN_EMAIL || 'sivaharsha.s-29@scds.saiuniversity.edu.in',
    studentId: '2023001',
    passwordHash: await bcrypt.hash(adminPassword, 10),
    role: 'admin',
    phone: '+91 90000 00001',
  });
  const student = await User.create({
    name: 'Demo Student',
    email: 'demo.student@saiuniversity.edu',
    studentId: '2023999',
    passwordHash: await bcrypt.hash(userPassword, 10),
    role: 'user',
    phone: '+91 90000 00002',
  });
  const priya = await User.create({
    name: 'Priya Raman',
    email: 'priya@saiuniversity.edu',
    studentId: '2023044',
    passwordHash: await bcrypt.hash(userPassword, 10),
    role: 'user',
    phone: '+91 90000 00003',
  });

  const rows = [
    // The deliberate match pair: these two must score above the threshold.
    {
      reporterId: student.id, type: 'lost', title: 'Black wired earphones',
      category: 'electronics',
      description: 'Black wired earphones with a red cable, kept in a small white pouch. Might have been left in the library reading room.',
      privateDetail: 'One earbud has a scratch on the outer shell',
      colour: 'black', brand: 'boat',
      building: 'central-library', locationDetail: 'Reading room, second floor',
      dateOccurred: dateOnly(3), status: 'active', viewCount: 41,
    },
    {
      reporterId: priya.id, type: 'found', title: 'Earphones with red cable',
      category: 'electronics',
      description: 'Found a pair of black wired earphones with a red cable inside a white pouch on a library table.',
      privateDetail: 'Scratch visible on the right earbud',
      colour: 'black', brand: 'boat',
      building: 'central-library', locationDetail: 'Reading room table 7',
      dateOccurred: dateOnly(2), status: 'active', viewCount: 63,
    },
    {
      reporterId: student.id, type: 'lost', title: 'Student ID card',
      category: 'id-cards-documents',
      description: 'Blue lanyard with my Sai University student ID card. Lost somewhere between the cafeteria and Academic Block A.',
      privateDetail: 'Card number ends with 001', colour: 'blue',
      building: 'cafeteria', locationDetail: 'Near the billing counter',
      dateOccurred: dateOnly(6), status: 'active', viewCount: 22,
    },
    {
      reporterId: priya.id, type: 'found', title: 'Student ID card on blue lanyard',
      category: 'id-cards-documents',
      description: 'Found a student ID card on a blue lanyard lying on a table in the cafeteria. Submitted to the lost and found desk.',
      privateDetail: 'Name on the card begins with S', colour: 'blue',
      building: 'cafeteria', locationDetail: 'Table near the window',
      dateOccurred: dateOnly(5), status: 'active', viewCount: 35,
    },
    {
      reporterId: priya.id, type: 'found', title: 'Blue water bottle',
      category: 'water-bottles',
      description: 'A navy blue steel water bottle, one litre, with a small dent near the base. Left in the computing lab after the afternoon session.',
      privateDetail: 'Sticker of a mountain on the side',
      colour: 'navy blue', brand: 'milton',
      building: 'computing-lab', locationDetail: 'Workstation row 3',
      dateOccurred: dateOnly(1), status: 'active', viewCount: 12,
    },
    {
      reporterId: student.id, type: 'lost', title: 'Casio scientific calculator',
      category: 'books-stationery',
      description: 'Grey Casio FX-991 calculator with my roll number written on the back in marker.',
      privateDetail: 'Roll number written on the battery cover',
      colour: 'grey', brand: 'casio',
      building: 'academic-block-b', locationDetail: 'Room B-204',
      dateOccurred: dateOnly(8), status: 'active', viewCount: 19,
    },
    {
      reporterId: priya.id, type: 'found', title: 'Set of keys with a green tag',
      category: 'keys',
      description: 'Three keys on a steel ring with a small green plastic tag. Found near the sports complex entrance.',
      privateDetail: 'The green tag has the letter H written on it', colour: 'green',
      building: 'sports-complex', locationDetail: 'Main gate',
      dateOccurred: dateOnly(4), status: 'active', viewCount: 27,
    },
    {
      reporterId: student.id, type: 'found', title: 'Black umbrella',
      category: 'other',
      description: 'Compact black folding umbrella left in the bus bay shelter. Kept at the lost and found desk.',
      privateDetail: 'Handle is wrapped in brown tape', colour: 'black',
      building: 'bus-bay', locationDetail: 'Shelter bench',
      dateOccurred: dateOnly(9), status: 'active', viewCount: 8,
    },
    {
      reporterId: priya.id, type: 'lost', title: 'Navy blue backpack',
      category: 'bags-backpacks',
      description: 'Navy blue Wildcraft backpack with a laptop sleeve. Has a small tear on the left strap.',
      privateDetail: 'A Chennai Metro card in the front pocket',
      colour: 'navy blue', brand: 'wildcraft',
      building: 'main-auditorium', locationDetail: 'Seating row F',
      dateOccurred: dateOnly(11), status: 'active', viewCount: 54,
    },
    {
      reporterId: student.id, type: 'lost', title: 'Silver bracelet',
      category: 'jewellery-accessories',
      description: 'Thin silver bracelet with a small heart charm, lost during the sports meet.',
      privateDetail: 'Engraved with the initials SR on the clasp', colour: 'silver',
      building: 'sports-complex', locationDetail: 'Athletics track',
      dateOccurred: dateOnly(14), status: 'active', viewCount: 16,
    },
    {
      reporterId: priya.id, type: 'found', title: 'Pair of black framed spectacles',
      category: 'jewellery-accessories',
      description: 'Black framed spectacles in a soft brown case, found on a chair in the student centre.',
      privateDetail: 'Left lens has a small crack', colour: 'black',
      building: 'student-centre', locationDetail: 'Common room',
      dateOccurred: dateOnly(7), status: 'active', viewCount: 21,
    },
    {
      reporterId: student.id, type: 'found', title: 'Grey hoodie',
      category: 'clothing',
      description: 'Grey hoodie left in the auditorium after the guest lecture. Size M, no name tag.',
      privateDetail: 'Has a small ink stain on the left cuff', colour: 'grey',
      building: 'main-auditorium', locationDetail: 'Back row',
      dateOccurred: dateOnly(20), status: 'returned', viewCount: 44, returnedAt: daysAgo(12),
    },
    {
      reporterId: priya.id, type: 'found', title: 'Red umbrella with wooden handle',
      category: 'other',
      description: 'Red umbrella with a wooden handle found in the administration block lobby.',
      privateDetail: 'Name written in marker inside the canopy', colour: 'red',
      building: 'admin-block', locationDetail: 'Reception lobby',
      dateOccurred: dateOnly(30), status: 'returned', viewCount: 31, returnedAt: daysAgo(25),
    },
    {
      reporterId: student.id, type: 'found', title: 'Wireless mouse',
      category: 'electronics',
      description: 'Black wireless mouse with a USB receiver, left in the computing lab. Reserved for a verified claimant.',
      privateDetail: 'Receiver taped to the battery cover', colour: 'black',
      building: 'computing-lab', locationDetail: 'Workstation row 1',
      dateOccurred: dateOnly(10), status: 'claimed', viewCount: 37,
    },
    {
      reporterId: priya.id, type: 'lost', title: 'Old printed notes bundle',
      category: 'books-stationery',
      description: 'Bundle of printed Web Technology notes with handwritten annotations.',
      privateDetail: 'First page has a blue sticky note', colour: 'white',
      building: 'academic-block-a', locationDetail: 'Room A-101',
      dateOccurred: dateOnly(120), status: 'archived', viewCount: 5, archivedAt: daysAgo(28),
    },
    {
      reporterId: student.id, type: 'found', title: 'Charging cable (Type-C)',
      category: 'electronics',
      description: 'White Type-C charging cable found in the hostel common room. Please describe it to claim.',
      privateDetail: 'Cable has a small knot near the connector', colour: 'white',
      building: 'boys-hostel', locationDetail: 'Common room',
      dateOccurred: dateOnly(2), status: 'pending', viewCount: 0,
    },
  ];

  // Give every row a creation time that follows its occurrence date, so any
  // duration derived from the data is positive. Sequelize would otherwise stamp
  // "now" on all of them, which makes returned_at appear before created_at.
  const withTimestamps = rows.map((row) => {
    const created = new Date(new Date(row.dateOccurred).getTime() + DAY);
    return { ...row, createdAt: created, updatedAt: created };
  });

  const items = await Item.bulkCreate(withTimestamps, { returning: true });
  const byTitle = (title) => items.find((i) => i.title === title);

  await Claim.create({
    itemId: byTitle('Wireless mouse').id,
    claimantId: priya.id,
    message: 'This is my mouse, I left it in the computing lab on Tuesday after the lab session.',
    verificationAnswer: 'The USB receiver is taped to the battery cover.',
    status: 'approved',
    decidedBy: admin.id,
    decidedAt: daysAgo(8),
    decisionNote: 'Verification answer matched the private detail.',
    pickupCode: generatePickupCode(),
  });

  await Claim.create({
    itemId: byTitle('Grey hoodie').id,
    claimantId: priya.id,
    message: 'I think the grey hoodie is mine, I left it in the auditorium.',
    verificationAnswer: 'It has an ink stain on the cuff.',
    status: 'collected',
    decidedBy: admin.id,
    decidedAt: daysAgo(13),
    decisionNote: 'Collected from the desk.',
    pickupCode: 'H4ND22',
    collectedAt: daysAgo(12),
  });

  await Claim.create({
    itemId: byTitle('Casio scientific calculator').id,
    claimantId: priya.id,
    message: 'That looks like my calculator, I lost one in block B.',
    verificationAnswer: 'My roll number is written on it.',
    status: 'rejected',
    decidedBy: admin.id,
    decidedAt: daysAgo(6),
    decisionNote: 'The claimant could not describe the marking on the battery cover.',
  });

  // Run the match engine over the seeded catalogue so the demo has real matches.
  const activeItems = await Item.findAll({ where: { status: 'active' } });
  let matchCount = 0;
  for (const item of activeItems) {
    const found = await generateMatchesFor(item);
    matchCount += found.length;
  }

  console.log('Seed complete.');
  console.log(`  users:   ${await User.count()}`);
  console.log(`  items:   ${await Item.count()}`);
  console.log(`  claims:  ${await Claim.count()}`);
  console.log(`  matches: ${matchCount} pair(s) generated`);
  console.log('');
  console.log(`  Admin  : ${admin.email} / ${adminPassword}`);
  console.log(`  Student: demo.student@saiuniversity.edu / ${userPassword}`);
  console.log(`  Student: priya@saiuniversity.edu / ${userPassword}`);

  if (close) await sequelize.close();
  return { users: await User.count(), items: await Item.count(), matches: matchCount };
}

if (require.main === module) {
  seed().catch(async (err) => {
    console.error('Seed failed:', err);
    await sequelize.close().catch(() => {});
    process.exit(1);
  });
}

module.exports = { seed };
