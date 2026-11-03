const { sequelize } = require('../models');
const { CATEGORIES, BUILDINGS, LOCATIONS_VERIFIED } = require('../utils/constants');
const storage = require('../utils/storage');
const mailer = require('../utils/mailer');

function categories(req, res) {
  return res.json({ success: true, data: { categories: CATEGORIES } });
}

function locations(req, res) {
  return res.json({
    success: true,
    data: { buildings: BUILDINGS, verified: LOCATIONS_VERIFIED },
  });
}

async function health(req, res) {
  let dbState = 'disconnected';
  try {
    await sequelize.authenticate();
    dbState = 'connected';
  } catch (err) {
    dbState = 'error';
  }
  const healthy = dbState === 'connected';
  return res.status(healthy ? 200 : 503).json({
    success: healthy,
    data: {
      status: healthy ? 'ok' : 'degraded',
      database: dbState,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      integrations: { storage: storage.status(), email: mailer.status() },
    },
  });
}

module.exports = { categories, locations, health };
