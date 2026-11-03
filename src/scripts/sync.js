/**
 * Creates or updates the tables to match the models.
 *
 *   npm run db:sync          create anything missing
 *   npm run db:sync -- alter  also apply column changes (dev only)
 *
 * On Supabase you can instead run database/schema.sql in the SQL editor, which
 * is the safer path for a shared database.
 */
require('dotenv').config();
const { sequelize } = require('../models');
const { connectDB } = require('../config/db');

(async () => {
  const alter = process.argv.includes('alter');
  await connectDB();
  await sequelize.sync({ alter });
  console.log(`[db] schema synced${alter ? ' (alter)' : ''}`);
  await sequelize.close();
})().catch(async (err) => {
  console.error('[db] sync failed:', err.message);
  process.exit(1);
});
