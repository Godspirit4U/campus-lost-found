const { Op } = require('sequelize');
const { Item, Claim, User } = require('../models');
const { serializeItem, serializeClaim } = require('../utils/serialize');
const { notify, notifyAdmins } = require('../utils/notify');
const { audit } = require('../utils/audit');
const { generateMatchesFor, matchesForItem } = require('../utils/match');
const storage = require('../utils/storage');

const SORTABLE = {
  newest: [['createdAt', 'DESC']],
  oldest: [['createdAt', 'ASC']],
  date_desc: [['dateOccurred', 'DESC']],
  date_asc: [['dateOccurred', 'ASC']],
  title_asc: [['title', 'ASC']],
  title_desc: [['title', 'DESC']],
};

const REPORTER_INCLUDE = { model: User, as: 'reporter', attributes: ['id', 'name', 'studentId', 'email', 'phone', 'role'] };

/** GET /api/items — public listing with search, filters, sorting, pagination. */
async function listItems(req, res, next) {
  try {
    const { q, type, category, building, status, from, to, sort = 'newest', page = '1', limit = '12' } = req.query;
    const isAdmin = req.user && req.user.role === 'admin';

    const where = { isDeleted: false };

    // A guest only ever sees approved, currently listed items.
    if (isAdmin && status && status !== 'all') where.status = status;
    else if (!isAdmin) where.status = 'active';

    if (type) where.type = type;
    if (category) where.category = category;
    if (building) where.building = building;

    if (from || to) {
      where.dateOccurred = {};
      if (from) where.dateOccurred[Op.gte] = from;
      if (to) where.dateOccurred[Op.lte] = to;
    }

    if (q && String(q).trim()) {
      // Sequelize parameterises the value, so a search box cannot inject SQL.
      const term = `%${String(q).trim()}%`;
      where[Op.or] = [
        { title: { [Op.iLike]: term } },
        { description: { [Op.iLike]: term } },
        { brand: { [Op.iLike]: term } },
        { colour: { [Op.iLike]: term } },
        { locationDetail: { [Op.iLike]: term } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));

    const { rows, count } = await Item.findAndCountAll({
      where,
      include: [REPORTER_INCLUDE],
      order: SORTABLE[sort] || SORTABLE.newest,
      offset: (pageNum - 1) * limitNum,
      limit: limitNum,
      distinct: true,
    });

    return res.json({
      success: true,
      data: {
        items: rows.map((i) => serializeItem(i, req.user)),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: count,
          pages: Math.max(1, Math.ceil(count / limitNum)),
        },
      },
    });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/items/:id */
async function getItem(req, res, next) {
  try {
    const item = await Item.findOne({
      where: { id: req.params.id, isDeleted: false },
      include: [REPORTER_INCLUDE],
    });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });

    const isOwner = req.user && String(item.reporterId) === String(req.user.id);
    const isAdmin = req.user && req.user.role === 'admin';
    if (item.status !== 'active' && !isOwner && !isAdmin) {
      // A pending or rejected listing must not be discoverable by strangers.
      return res.status(404).json({ success: false, message: 'Item not found.' });
    }

    if (!isOwner) {
      Item.increment({ viewCount: 1 }, { where: { id: item.id } }).catch(() => {});
    }

    return res.json({ success: true, data: { item: serializeItem(item, req.user) } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/items — multipart with up to 3 images. */
async function createItem(req, res, next) {
  try {
    const data = req.validated;

    if (data.type === 'found' && !data.privateDetail) {
      return res.status(400).json({
        success: false,
        message: 'For a found item you must add a private identifying detail so the owner can prove it is theirs.',
        errors: [{ field: 'privateDetail', message: 'Private identifying detail is required for found items.' }],
      });
    }

    // Upload first, then write the record: a failed upload must not create a
    // listing with broken images.
    const uploaded = [];
    for (const file of req.files || []) {
      const object = await storage.put({
        bucket: storage.ITEM_BUCKET(),
        buffer: file.buffer,
        contentType: file.mimetype,
        originalName: file.originalname,
        prefix: 'items',
      });
      uploaded.push(object.path);
    }
    const images = uploaded;

    const item = await Item.create({
      reporterId: req.user.id,
      type: data.type,
      title: data.title,
      category: data.category,
      description: data.description,
      privateDetail: data.privateDetail || '',
      colour: data.colour || '',
      brand: data.brand || '',
      building: data.building,
      locationDetail: data.locationDetail || '',
      dateOccurred: data.dateOccurred,
      images,
      // Reports publish immediately. The administrator keeps the ability to
      // take a listing down afterwards, which is enough for a campus tool and
      // removes the queue that would otherwise sit unattended.
      status: 'active',
    });

    // Run the match engine straight away so the reporter sees possible matches
    // on their own item page, and the other side is notified.
    const matches = await generateMatchesFor(item);
    for (const m of matches) {
      if (String(m.reporterId) === String(item.reporterId)) continue;
      const other = await Item.findByPk(m.matchedItemId);
      if (!other) continue;
      await notify({
        userId: m.reporterId,
        type: 'item.match',
        title: 'A possible match was found',
        message: `"${other.title}" looks similar to "${item.title}".`,
        link: `/item.html?id=${other.id}`,
      });
    }

    await notifyAdmins({
      type: 'item.published',
      title: 'New report published',
      message: `${item.title} (${item.type}) was submitted by ${req.user.name}.`,
      link: '/admin.html?tab=items',
    });
    await audit(req, { action: 'item.create', entityType: 'Item', entityId: item.id, summary: `Created ${item.type} item "${item.title}"` });

    return res.status(201).json({
      success: true,
      message: 'Report published. It is now visible to everyone on campus.',
      data: { item: serializeItem(item, req.user), matches: matches.length },
    });
  } catch (err) {
    return next(err);
  }
}

/** PATCH /api/items/:id */
async function updateItem(req, res, next) {
  try {
    const item = await Item.findOne({ where: { id: req.params.id, isDeleted: false } });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });

    const isOwner = String(item.reporterId) === String(req.user.id);
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'You can only edit your own reports.' });
    }
    if (!isAdmin && !['pending', 'active'].includes(item.status)) {
      return res.status(400).json({ success: false, message: `A ${item.status} item can no longer be edited.` });
    }

    const d = req.validated;
    const patch = {};
    ['title', 'category', 'description', 'privateDetail', 'colour', 'brand', 'locationDetail'].forEach((k) => {
      if (d[k] !== undefined) patch[k] = d[k];
    });

    // Images: keep the ones the form retained, add anything newly uploaded, and
    // delete from storage whatever was dropped. The cap stays at three.
    if (req.files && req.files.length) {
      let keep = [];
      if (typeof d.keepImages === 'string' && d.keepImages) {
        try { keep = JSON.parse(d.keepImages); } catch { keep = []; }
      } else if (Array.isArray(item.images)) {
        keep = item.images;
      }
      keep = keep.slice(0, 3);

      const added = [];
      for (const file of req.files) {
        if (keep.length + added.length >= 3) break;
        const object = await storage.put({
          bucket: storage.ITEM_BUCKET(),
          buffer: file.buffer,
          contentType: file.mimetype,
          originalName: file.originalname,
          prefix: 'items',
        });
        added.push(object.path);
      }

      const removed = (item.images || []).filter((k) => !keep.includes(k));
      if (removed.length) await storage.remove({ bucket: storage.ITEM_BUCKET(), paths: removed });
      patch.images = [...keep, ...added];
    } else if (typeof d.keepImages === 'string') {
      let keep = [];
      try { keep = JSON.parse(d.keepImages); } catch { keep = []; }
      keep = keep.slice(0, 3);
      const removed = (item.images || []).filter((k) => !keep.includes(k));
      if (removed.length) await storage.remove({ bucket: storage.ITEM_BUCKET(), paths: removed });
      patch.images = keep;
    }
    if (d.building !== undefined) patch.building = d.building;
    if (d.dateOccurred !== undefined) patch.dateOccurred = d.dateOccurred;

    await item.update(patch);
    await audit(req, { action: 'item.update', entityType: 'Item', entityId: item.id, summary: `Updated "${item.title}"` });

    return res.json({ success: true, message: 'Listing updated.', data: { item: serializeItem(item, req.user) } });
  } catch (err) {
    return next(err);
  }
}

/** DELETE /api/items/:id — soft delete so statistics and history survive. */
async function deleteItem(req, res, next) {
  try {
    const item = await Item.findOne({ where: { id: req.params.id, isDeleted: false } });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });

    const isOwner = String(item.reporterId) === String(req.user.id);
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You can only delete your own reports.' });
    }
    if (item.status === 'claimed' && req.user.role !== 'admin') {
      return res.status(400).json({ success: false, message: 'An item with an approved claim cannot be deleted.' });
    }

    await item.update({ isDeleted: true });
    // Soft delete keeps the record for the audit trail but the images are no
    // longer reachable from anywhere, so drop the objects too.
    if (item.images && item.images.length) {
      await storage.remove({ bucket: storage.ITEM_BUCKET(), paths: item.images });
    }
    await audit(req, { action: 'item.delete', entityType: 'Item', entityId: item.id, summary: `Deleted "${item.title}"` });

    return res.json({ success: true, message: 'Listing removed.' });
  } catch (err) {
    return next(err);
  }
}

/** PATCH /api/items/:id/status — moderation and lifecycle changes. */
async function setStatus(req, res, next) {
  try {
    const { status, adminNote } = req.validated;
    const item = await Item.findOne({ where: { id: req.params.id, isDeleted: false } });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });

    const previous = item.status;
    const patch = { status };
    if (adminNote !== undefined) patch.adminNote = adminNote;
    if (status === 'returned' && !item.returnedAt) patch.returnedAt = new Date();
    if (status === 'archived' && !item.archivedAt) patch.archivedAt = new Date();
    await item.update(patch);

    await notify({
      userId: item.reporterId,
      type: `item.${status}`,
      title:
        status === 'active' ? 'Your report is now live'
          : status === 'rejected' ? 'Your report was not approved'
            : `Report marked ${status}`,
      message: adminNote ? `Administrator note: ${adminNote}` : `"${item.title}" is now ${status}.`,
      link: `/item.html?id=${item.id}`,
    });

    // Matching runs when an item becomes visible: a pending item has nothing to
    // be matched against in the public catalogue yet.
    let matches = [];
    if (status === 'active') {
      matches = await generateMatchesFor(item);
      for (const m of matches) {
        if (String(m.reporterId) === String(item.reporterId)) continue;
        const other = await Item.findByPk(m.matchedItemId);
        if (!other) continue;
        await notify({
          userId: m.reporterId,
          type: 'item.match',
          title: 'A possible match was found',
          message: `"${other.title}" looks similar to "${item.title}".`,
          link: `/item.html?id=${other.id}`,
        });
      }
    }

    await audit(req, {
      action: 'item.status_change',
      entityType: 'Item',
      entityId: item.id,
      summary: `"${item.title}": ${previous} -> ${status}`,
    });

    return res.json({
      success: true,
      message: `Item is now ${status}.`,
      data: { item: serializeItem(item, req.user), matches: matches.length },
    });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/items/mine */
async function myItems(req, res, next) {
  try {
    const items = await Item.findAll({
      where: { reporterId: req.user.id, isDeleted: false },
      order: [['createdAt', 'DESC']],
    });

    const claims = await Claim.findAll({
      where: { itemId: { [Op.in]: items.map((i) => i.id) } },
      attributes: ['itemId', 'status'],
      raw: true,
    });

    const countsByItem = {};
    claims.forEach((c) => {
      countsByItem[c.itemId] = countsByItem[c.itemId] || {};
      countsByItem[c.itemId][c.status] = (countsByItem[c.itemId][c.status] || 0) + 1;
    });

    return res.json({
      success: true,
      data: {
        items: items.map((i) => ({
          ...serializeItem(i, req.user),
          claims: countsByItem[i.id] || {},
        })),
      },
    });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/items/:id/matches — owner or admin only. */
async function itemMatches(req, res, next) {
  try {
    const item = await Item.findOne({ where: { id: req.params.id, isDeleted: false } });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });

    const isOwner = String(item.reporterId) === String(req.user.id);
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only the reporter or an administrator can see matches.' });
    }

    const matches = await matchesForItem(item);
    return res.json({
      success: true,
      data: {
        matches: matches.map((m) => ({
          id: m.id,
          score: m.score,
          reasons: m.reasons,
          status: m.status,
          lostItem: serializeItem(m.lostItem, req.user),
          foundItem: serializeItem(m.foundItem, req.user),
        })),
      },
    });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/items/:id/claims — the owner of the item, or an admin. */
async function itemClaims(req, res, next) {
  try {
    const item = await Item.findOne({ where: { id: req.params.id, isDeleted: false } });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });

    const isOwner = String(item.reporterId) === String(req.user.id);
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You cannot view claims on this item.' });
    }

    const claims = await Claim.findAll({
      where: { itemId: item.id },
      include: [{ model: User, as: 'claimant', attributes: ['id', 'name', 'studentId', 'email'] }],
      order: [['createdAt', 'DESC']],
    });
    return res.json({ success: true, data: { claims: claims.map((c) => serializeClaim(c, req.user)) } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listItems, getItem, createItem, updateItem, deleteItem, setStatus, myItems, itemMatches, itemClaims,
};
