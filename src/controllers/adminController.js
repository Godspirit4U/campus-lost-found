const { Op, QueryTypes } = require('sequelize');
const {
  sequelize, Item, Claim, User, AuditLog, Match, Notification, PasswordReset,
} = require('../models');
const { serializeUser, serializeItem } = require('../utils/serialize');
const { audit } = require('../utils/audit');
const { findDuplicates } = require('../utils/match');
const storage = require('../utils/storage');
const { CATEGORIES, BUILDINGS } = require('../utils/constants');

const DAY = 24 * 60 * 60 * 1000;

/**
 * GET /api/admin/stats
 * The numbers behind the admin overview. Definitions live here and are repeated
 * in the README so the dashboard and the report always agree.
 */
async function stats(req, res, next) {
  try {
    const [itemRows, claimRows, returnedRows, pendingOldClaims, totalUsers] = await Promise.all([
      sequelize.query(
        'SELECT type, status, COUNT(*) AS count FROM items WHERE is_deleted = false GROUP BY type, status',
        { type: QueryTypes.SELECT }
      ),
      sequelize.query('SELECT status, COUNT(*) AS count FROM claims GROUP BY status', { type: QueryTypes.SELECT }),
      sequelize.query(
        "SELECT created_at, returned_at FROM items WHERE status = 'returned' AND is_deleted = false AND returned_at IS NOT NULL",
        { type: QueryTypes.SELECT }
      ),
      Claim.count({ where: { status: 'pending', createdAt: { [Op.lt]: new Date(Date.now() - 3 * DAY) } } }),
      User.count(),
    ]);

    const byType = { lost: {}, found: {} };
    itemRows.forEach((row) => {
      byType[row.type] = byType[row.type] || {};
      byType[row.type][row.status] = Number(row.count);
    });

    const sum = (obj) => Object.values(obj || {}).reduce((a, b) => a + b, 0);
    const statusCount = (status) => (byType.lost[status] || 0) + (byType.found[status] || 0);

    const claims = claimRows.reduce((acc, row) => ({ ...acc, [row.status]: Number(row.count) }), {});
    const returned = statusCount('returned');
    const archived = statusCount('archived');
    const closed = returned + archived;

    // Only non-negative spans count. A record whose return predates its creation
    // is inconsistent data, and averaging it in would produce a nonsense figure.
    const spans = returnedRows
      .map((row) => (new Date(row.returned_at) - new Date(row.created_at)) / DAY)
      .filter((days) => Number.isFinite(days) && days >= 0);
    const avgDays = spans.length ? spans.reduce((a, b) => a + b, 0) / spans.length : 0;

    return res.json({
      success: true,
      data: {
        totals: {
          totalLost: sum(byType.lost),
          totalFound: sum(byType.found),
          totalReports: sum(byType.lost) + sum(byType.found),
          activeListings: statusCount('active'),
          claimed: statusCount('claimed'),
          returned,
          pendingModeration: statusCount('pending'),
          rejected: statusCount('rejected'),
          archived,
          totalUsers,
        },
        lostBreakdown: byType.lost,
        foundBreakdown: byType.found,
        claims: {
          pending: claims.pending || 0,
          approved: claims.approved || 0,
          collected: claims.collected || 0,
          rejected: claims.rejected || 0,
          cancelled: claims.cancelled || 0,
          approvedTotal: (claims.approved || 0) + (claims.collected || 0),
          pendingOlderThan3Days: pendingOldClaims,
        },
        performance: {
          // Share of closed cases that ended in a return, not in archival.
          recoveryRate: closed > 0 ? Math.round((returned / closed) * 1000) / 10 : 0,
          avgResolutionDays: Math.round(avgDays * 10) / 10,
          returnedCount: returnedRows.length,
        },
      },
    });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/admin/charts */
async function charts(req, res, next) {
  try {
    const [byCategoryRaw, byBuildingRaw, claimOutcomesRaw, recent] = await Promise.all([
      sequelize.query(
        "SELECT category, type, COUNT(*) AS count FROM items WHERE is_deleted = false AND status IN ('active','claimed','returned') GROUP BY category, type",
        { type: QueryTypes.SELECT }
      ),
      sequelize.query(
        'SELECT building, COUNT(*) AS count FROM items WHERE is_deleted = false GROUP BY building',
        { type: QueryTypes.SELECT }
      ),
      sequelize.query('SELECT status, COUNT(*) AS count FROM claims GROUP BY status', { type: QueryTypes.SELECT }),
      Item.findAll({
        where: { isDeleted: false, createdAt: { [Op.gte]: new Date(Date.now() - 56 * DAY) } },
        attributes: ['type', 'createdAt'],
        raw: true,
      }),
    ]);

    const categoryMap = {};
    byCategoryRaw.forEach((row) => {
      categoryMap[row.category] = categoryMap[row.category] || { category: row.category, lost: 0, found: 0 };
      categoryMap[row.category][row.type] = Number(row.count);
    });
    const byCategory = Object.values(categoryMap)
      .map((row) => {
        const meta = CATEGORIES.find((c) => c.slug === row.category);
        return { ...row, name: meta ? meta.name : row.category };
      })
      .sort((a, b) => b.lost + b.found - (a.lost + a.found));

    const byBuilding = byBuildingRaw
      .map((row) => {
        const meta = BUILDINGS.find((b) => b.slug === row.building);
        return { building: row.building, name: meta ? meta.name : row.building, count: Number(row.count) };
      })
      .sort((a, b) => b.count - a.count);

    // Eight weekly buckets, oldest first, bucketed in JS so the query stays
    // readable and portable.
    const weeklyTrend = [];
    for (let i = 7; i >= 0; i -= 1) {
      const end = new Date(Date.now() - i * 7 * DAY);
      const start = new Date(end.getTime() - 7 * DAY);
      const inRange = recent.filter((item) => {
        const t = new Date(item.createdAt).getTime();
        return t >= start.getTime() && t < end.getTime();
      });
      weeklyTrend.push({
        label: `${start.getDate()}/${start.getMonth() + 1}`,
        lost: inRange.filter((i2) => i2.type === 'lost').length,
        found: inRange.filter((i2) => i2.type === 'found').length,
      });
    }

    const claimOutcomes = claimOutcomesRaw.map((row) => ({ status: row.status, count: Number(row.count) }));

    return res.json({ success: true, data: { byCategory, byBuilding, weeklyTrend, claimOutcomes } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/admin/users */
async function listUsers(req, res, next) {
  try {
    const q = (req.query.q || '').trim();
    const where = q
      ? { [Op.or]: [{ name: { [Op.iLike]: `%${q}%` } }, { email: { [Op.iLike]: `%${q}%` } }, { studentId: { [Op.iLike]: `%${q}%` } }] }
      : {};

    const users = await User.findAll({ where, order: [['createdAt', 'DESC']], limit: 200 });
    const counts = await sequelize.query(
      'SELECT reporter_id, COUNT(*) AS count FROM items WHERE is_deleted = false GROUP BY reporter_id',
      { type: QueryTypes.SELECT }
    );
    const countByUser = counts.reduce((acc, row) => ({ ...acc, [row.reporter_id]: Number(row.count) }), {});

    const claimCounts = await sequelize.query(
      'SELECT claimant_id, COUNT(*) AS count FROM claims GROUP BY claimant_id',
      { type: QueryTypes.SELECT }
    );
    const claimsByUser = claimCounts.reduce((acc, row) => ({ ...acc, [row.claimant_id]: Number(row.count) }), {});

    return res.json({
      success: true,
      data: {
        users: users.map((u) => ({
          ...serializeUser(u),
          listingCount: countByUser[u.id] || 0,
          claimCount: claimsByUser[u.id] || 0,
          isSelf: String(u.id) === String(req.user.id),
        })),
      },
    });
  } catch (err) {
    return next(err);
  }
}

/** PATCH /api/admin/users/:id */
async function updateUser(req, res, next) {
  try {
    const { role, isBlocked } = req.validated;
    if (String(req.params.id) === String(req.user.id) && (role === 'user' || isBlocked === true)) {
      return res.status(400).json({ success: false, message: 'You cannot demote or block your own account.' });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const patch = {};
    if (role !== undefined) patch.role = role;
    if (isBlocked !== undefined) patch.isBlocked = isBlocked;
    await user.update(patch);

    await audit(req, {
      action: 'user.update',
      entityType: 'User',
      entityId: user.id,
      summary: `role=${user.role} blocked=${user.isBlocked} for ${user.email}`,
    });

    return res.json({ success: true, message: 'User updated.', data: { user: serializeUser(user) } });
  } catch (err) {
    return next(err);
  }
}

/**
 * DELETE /api/admin/users/:id
 *
 * Removes the account and everything hanging off it: their listings (and the
 * images of those listings), their claims and their claim evidence, and their
 * notifications. Foreign keys cascade, so this is genuinely permanent.
 *
 * Refused for your own account, and for the last remaining administrator, so the
 * desk cannot lock itself out.
 */
async function deleteUser(req, res, next) {
  try {
    const target = await User.findByPk(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'User not found.' });

    if (String(target.id) === String(req.user.id)) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account from the desk.' });
    }

    if (target.role === 'admin') {
      const admins = await User.count({ where: { role: 'admin' } });
      if (admins <= 1) {
        return res.status(400).json({ success: false, message: 'That is the last administrator. Promote someone else first.' });
      }
    }

    // Clear stored objects before the rows disappear, otherwise they are orphaned.
    const ownedItems = await Item.findAll({ where: { reporterId: target.id }, attributes: ['id', 'images'] });
    const imageKeys = ownedItems.flatMap((item) => (Array.isArray(item.images) ? item.images : []));
    if (imageKeys.length) {
      await storage.remove({ bucket: storage.ITEM_BUCKET(), paths: imageKeys });
    }

    const proofs = await Claim.findAll({ where: { claimantId: target.id }, attributes: ['proofImage'] });
    const proofKeys = proofs.map((c) => c.proofImage).filter(Boolean);
    if (proofKeys.length) {
      await storage.remove({ bucket: storage.PROOF_BUCKET(), paths: proofKeys });
    }

    const itemCount = ownedItems.length;
    const claimCount = await Claim.count({ where: { claimantId: target.id } });

    // Remove dependants explicitly rather than trusting the database's cascade
    // rules, so the outcome is identical on any engine.
    const itemIds = ownedItems.map((i) => i.id);
    if (itemIds.length) {
      await Claim.destroy({ where: { itemId: { [Op.in]: itemIds } } });
      await Match.destroy({ where: { [Op.or]: [{ lostItemId: { [Op.in]: itemIds } }, { foundItemId: { [Op.in]: itemIds } }] } });
      await Item.destroy({ where: { id: { [Op.in]: itemIds } } });
    }
    await Claim.destroy({ where: { claimantId: target.id } });
    await Notification.destroy({ where: { userId: target.id } });
    await PasswordReset.destroy({ where: { userId: target.id } });

    await target.destroy();

    await audit(req, {
      action: 'user.delete',
      entityType: 'User',
      entityId: req.params.id,
      summary: `Deleted ${target.email} (${itemCount} listing(s), ${claimCount} claim(s))`,
    });

    return res.json({
      success: true,
      message: 'Account deleted.',
      data: { removed: { user: 1, items: itemCount, claims: claimCount } },
    });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/admin/audit-log */
async function auditLog(req, res, next) {
  try {
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
    const logs = await AuditLog.findAll({
      order: [['createdAt', 'DESC']],
      limit,
      include: [{ model: User, as: 'actor', attributes: ['id', 'name', 'email', 'role'] }],
    });
    return res.json({
      success: true,
      data: {
        logs: logs.map((l) => ({
          id: l.id,
          actor: l.actor ? { name: l.actor.name, email: l.actor.email, role: l.actor.role } : { name: 'system' },
          action: l.action,
          entityType: l.entityType,
          entityId: l.entityId,
          summary: l.summary,
          ip: l.ip,
          createdAt: l.createdAt,
        })),
      },
    });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/admin/duplicates — same-type reports that look like one item. */
async function duplicates(req, res, next) {
  try {
    const pairs = await findDuplicates(60);
    return res.json({
      success: true,
      data: {
        pairs: pairs.map((p) => ({
          score: p.score,
          reasons: p.reasons,
          a: serializeItem(p.a, req.user),
          b: serializeItem(p.b, req.user),
        })),
      },
    });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/admin/items — every listing regardless of status. */
async function allItems(req, res, next) {
  try {
    const { status, q } = req.query;
    const where = { isDeleted: false };
    if (status && status !== 'all') where.status = status;
    if (q) where.title = { [Op.iLike]: `%${q}%` };

    const items = await Item.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: 200,
      include: [{ model: User, as: 'reporter', attributes: ['id', 'name', 'studentId'] }],
    });
    return res.json({ success: true, data: { items: items.map((i) => serializeItem(i, req.user)) } });
  } catch (err) {
    return next(err);
  }
}

module.exports = { stats, charts, listUsers, updateUser, deleteUser, auditLog, duplicates, allItems };
