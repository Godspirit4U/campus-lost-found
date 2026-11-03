const { Notification, User } = require('../models');

/**
 * Notifications are best effort: a failure to notify must never roll back the
 * action the user actually asked for.
 */
async function notify({ userId, type, title, message = '', link = '' }) {
  if (!userId) return null;
  try {
    return await Notification.create({ userId, type, title, message, link });
  } catch (err) {
    console.error('[notify] failed:', err.message);
    return null;
  }
}

async function notifyAdmins({ type, title, message = '', link = '' }) {
  try {
    const admins = await User.findAll({ where: { role: 'admin' }, attributes: ['id'], raw: true });
    await Promise.all(admins.map((a) => notify({ userId: a.id, type, title, message, link })));
  } catch (err) {
    console.error('[notifyAdmins] failed:', err.message);
  }
}

module.exports = { notify, notifyAdmins };
