const { Notification } = require('../models');

async function listNotifications(req, res, next) {
  try {
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 30);
    const [rows, unreadCount] = await Promise.all([
      Notification.findAll({ where: { userId: req.user.id }, order: [['createdAt', 'DESC']], limit }),
      Notification.count({ where: { userId: req.user.id, isRead: false } }),
    ]);
    return res.json({
      success: true,
      data: {
        notifications: rows.map((n) => ({
          id: n.id, type: n.type, title: n.title, message: n.message,
          link: n.link, isRead: n.isRead, createdAt: n.createdAt,
        })),
        unreadCount,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function markRead(req, res, next) {
  try {
    const [updated] = await Notification.update(
      { isRead: true },
      { where: { id: req.params.id, userId: req.user.id } }
    );
    if (!updated) return res.status(404).json({ success: false, message: 'Notification not found.' });
    return res.json({ success: true, message: 'Marked as read.' });
  } catch (err) {
    return next(err);
  }
}

async function markAllRead(req, res, next) {
  try {
    await Notification.update({ isRead: true }, { where: { userId: req.user.id, isRead: false } });
    return res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listNotifications, markRead, markAllRead };
