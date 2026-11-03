const { AuditLog } = require('../models');

/** Fire and forget audit write; it never blocks or fails the response. */
async function audit(req, { action, entityType = '', entityId = '', summary = '' }) {
  try {
    await AuditLog.create({
      actorId: req.user ? req.user.id : null,
      actorRole: req.user ? req.user.role : 'guest',
      action,
      entityType,
      entityId: entityId ? String(entityId) : '',
      summary,
      ip: req.ip || '',
      userAgent: (req.headers['user-agent'] || '').slice(0, 300),
    });
  } catch (err) {
    console.error('[audit] failed:', err.message);
  }
}

module.exports = { audit };
