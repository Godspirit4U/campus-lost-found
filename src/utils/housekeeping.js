const { Op } = require('sequelize');
const { Item } = require('../models');

const DAY = 24 * 60 * 60 * 1000;

/**
 * Archive listings nobody has claimed within the holding period. Runs once a day
 * inside the process, which is enough for a single-instance deployment and needs
 * no external scheduler.
 */
async function archiveStaleItems() {
  const days = parseInt(process.env.ARCHIVE_AFTER_DAYS, 10) || 90;
  const cutoff = new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
  try {
    const [updated] = await Item.update(
      { status: 'archived', archivedAt: new Date() },
      { where: { status: 'active', dateOccurred: { [Op.lt]: cutoff }, isDeleted: false } }
    );
    if (updated) console.log(`[housekeeping] archived ${updated} stale listing(s)`);
  } catch (err) {
    console.error('[housekeeping] failed:', err.message);
  }
}

module.exports = { archiveStaleItems };
