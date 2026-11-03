require('dotenv').config();
const { Sequelize } = require('sequelize');

/**
 * One Sequelize instance for the whole application.
 *
 * Supabase requires TLS, so SSL is enabled unless the connection string points
 * at localhost. Set DATABASE_SSL=false to force it off for a local Postgres.
 */
function buildOptions() {
  const url = process.env.DATABASE_URL;
  const isLocal = !url || /localhost|127\.0\.0\.1/.test(url);
  const useSsl = process.env.DATABASE_SSL ? process.env.DATABASE_SSL !== 'false' : !isLocal;

  return {
    dialect: 'postgres',
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
    dialectOptions: useSsl
      ? { ssl: { require: true, rejectUnauthorized: false } }
      : {},
    pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
    define: { underscored: true, timestamps: true },
  };
}

let sequelize;

function getSequelize() {
  if (!sequelize) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is not set. Copy .env.example to .env first.');
    }
    sequelize = new Sequelize(url, buildOptions());
  }
  return sequelize;
}

/** Inject an already built instance (used by the test suite). */
function setSequelize(instance) {
  sequelize = instance;
}

async function connectDB() {
  const db = getSequelize();
  await db.authenticate();
  // Read the name from the connection config rather than a query, so the same
  // function works against any Postgres compatible engine.
  console.log(`[db] connected to ${db.config.database || 'database'}`);
  return db;
}

async function disconnectDB() {
  if (sequelize) await sequelize.close();
}

module.exports = { getSequelize, setSequelize, connectDB, disconnectDB };
