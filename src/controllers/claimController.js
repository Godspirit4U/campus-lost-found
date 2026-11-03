const { Op } = require('sequelize');
const { Claim, Item, User } = require('../models');
const { serializeClaim } = require('../utils/serialize');
const { notify, notifyAdmins } = require('../utils/notify');
const { audit } = require('../utils/audit');
const { generatePickupCode } = require('../utils/pickup');
const storage = require('../utils/storage');
const jwt = require('jsonwebtoken');

const ITEM_INCLUDE = { model: Item, as: 'item' };
const CLAIMANT_INCLUDE = { model: User, as: 'claimant', attributes: ['id', 'name', 'studentId', 'email'] };

/**
 * POST /api/items/:id/claims
 * Guards, in order: item exists and is claimable, claimant is not the reporter,
 * claimant holds no other open claim on this item.
 */
async function createClaim(req, res, next) {
  try {
    const item = await Item.findOne({ where: { id: req.params.id, isDeleted: false } });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });

    if (String(item.reporterId) === String(req.user.id)) {
      return res.status(400).json({ success: false, message: 'You cannot claim an item you reported yourself.' });
    }
    if (item.status !== 'active') {
      return res.status(400).json({ success: false, message: `This item is ${item.status} and is not open to claims.` });
    }

    const openClaim = await Claim.findOne({
      where: { itemId: item.id, claimantId: req.user.id, status: 'pending' },
    });
    if (openClaim) {
      return res.status(409).json({ success: false, message: 'You already have an open claim on this item.' });
    }

    // Evidence goes to the private bucket; only the object key is stored.
    let proofKey = '';
    if (req.file) {
      const object = await storage.put({
        bucket: storage.PROOF_BUCKET(),
        buffer: req.file.buffer,
        contentType: req.file.mimetype,
        originalName: req.file.originalname,
        prefix: 'claims',
      });
      proofKey = object.path;
    }

    const claim = await Claim.create({
      itemId: item.id,
      claimantId: req.user.id,
      message: req.validated.message,
      verificationAnswer: req.validated.verificationAnswer,
      proofImage: proofKey,
    });

    await notify({
      userId: item.reporterId,
      type: 'claim.created',
      title: 'Someone claimed your item',
      message: `A claim was submitted for "${item.title}". An administrator will review it.`,
      link: '/dashboard.html?tab=claims-on-my-items',
    });
    await notify({
      userId: req.user.id,
      type: 'claim.submitted',
      title: 'Claim submitted',
      message: `Your claim for "${item.title}" is awaiting review.`,
      link: '/dashboard.html?tab=my-claims',
    });
    await audit(req, { action: 'claim.create', entityType: 'Claim', entityId: claim.id, summary: `Claim on "${item.title}"` });

    return res.status(201).json({
      success: true,
      message: 'Claim submitted. You will be notified once an administrator reviews it.',
      data: { claim: serializeClaim(claim, req.user) },
    });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/claims/mine */
async function myClaims(req, res, next) {
  try {
    const claims = await Claim.findAll({
      where: { claimantId: req.user.id },
      include: [ITEM_INCLUDE, CLAIMANT_INCLUDE],
      order: [['createdAt', 'DESC']],
    });
    return res.json({ success: true, data: { claims: claims.map((c) => serializeClaim(c, req.user)) } });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/claims — admin queue. */
async function listClaims(req, res, next) {
  try {
    const { status } = req.query;
    const where = {};
    if (status && status !== 'all') where.status = status;

    const claims = await Claim.findAll({
      where,
      include: [ITEM_INCLUDE, CLAIMANT_INCLUDE],
      order: [['createdAt', 'DESC']],
      limit: 200,
    });

    const rows = await Claim.findAll({ attributes: ['status'], raw: true });
    const counts = rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});

    const serialised = claims.map((c) => serializeClaim(c, req.user));
    return res.json({
      success: true,
      data: {
        claims: serialised.map((c) => ({ ...c, hasProof: Boolean(c.proofImage) })),
        counts,
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /api/claims/:id — approve or reject.
 *
 * This is the one place that owns the item/claim status invariant: approving
 * reserves the item, and rejecting the last outstanding approval releases it.
 */
async function decideClaim(req, res, next) {
  try {
    const { action, decisionNote } = req.validated;
    const claim = await Claim.findByPk(req.params.id);
    if (!claim) return res.status(404).json({ success: false, message: 'Claim not found.' });
    if (claim.status !== 'pending') {
      return res.status(400).json({ success: false, message: `This claim is already ${claim.status}.` });
    }

    const item = await Item.findByPk(claim.itemId);
    if (!item) return res.status(404).json({ success: false, message: 'The linked item no longer exists.' });

    if (action === 'approve') {
      if (item.status !== 'active') {
        return res.status(400).json({ success: false, message: `This item is ${item.status} and cannot be awarded.` });
      }

      const pickupCode = generatePickupCode();
      await claim.update({
        status: 'approved',
        pickupCode,
        decidedBy: req.user.id,
        decidedAt: new Date(),
        decisionNote: decisionNote || '',
      });
      await item.update({ status: 'claimed' });

      await notify({
        userId: claim.claimantId,
        type: 'claim.approved',
        title: 'Your claim was approved',
        message: `Collect "${item.title}" from the lost and found desk. Your pickup code is ${pickupCode}.`,
        link: '/dashboard.html?tab=my-claims',
      });
      await notify({
        userId: item.reporterId,
        type: 'claim.approved',
        title: 'Claim approved on your item',
        message: `"${item.title}" has been reserved for a verified claimant.`,
        link: `/item.html?id=${item.id}`,
      });
      await audit(req, { action: 'claim.approve', entityType: 'Claim', entityId: claim.id, summary: `Approved claim on "${item.title}"` });
    } else {
      await claim.update({
        status: 'rejected',
        decidedBy: req.user.id,
        decidedAt: new Date(),
        decisionNote: decisionNote || '',
      });

      // Release the item only if no other approval is holding it.
      if (item.status === 'claimed') {
        const otherApproved = await Claim.count({
          where: { itemId: item.id, status: { [Op.in]: ['approved', 'collected'] } },
        });
        if (otherApproved === 0) await item.update({ status: 'active' });
      }

      await notify({
        userId: claim.claimantId,
        type: 'claim.rejected',
        title: 'Your claim was not approved',
        message: decisionNote ? `Reason: ${decisionNote}` : 'The administrator could not verify ownership.',
        link: '/dashboard.html?tab=my-claims',
      });
      await audit(req, { action: 'claim.reject', entityType: 'Claim', entityId: claim.id, summary: `Rejected claim on "${item.title}"` });
    }

    return res.json({
      success: true,
      message: `Claim ${claim.status}.`,
      data: { claim: serializeClaim(claim, req.user) },
    });
  } catch (err) {
    return next(err);
  }
}

/** PATCH /api/claims/:id/cancel — the claimant withdraws an open claim. */
async function cancelClaim(req, res, next) {
  try {
    const claim = await Claim.findByPk(req.params.id);
    if (!claim) return res.status(404).json({ success: false, message: 'Claim not found.' });
    if (String(claim.claimantId) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'You can only cancel your own claim.' });
    }
    if (claim.status !== 'pending') {
      return res.status(400).json({ success: false, message: `A ${claim.status} claim cannot be cancelled.` });
    }

    await claim.update({ status: 'cancelled' });

    const cancelledItem = await Item.findByPk(claim.itemId);
    if (cancelledItem) {
      await notify({
        userId: cancelledItem.reporterId,
        type: 'claim.cancelled',
        title: 'A claim on your item was withdrawn',
        message: `The claim on "${cancelledItem.title}" was cancelled by the claimant. The item is still listed.`,
        link: `/item.html?id=${cancelledItem.id}`,
      });
    }
    await notifyAdmins({
      type: 'claim.cancelled',
      title: 'A claim was withdrawn',
      message: `Claim ${claim.id} was cancelled by the claimant.`,
      link: '/admin.html?tab=claims',
    });

    await audit(req, { action: 'claim.cancel', entityType: 'Claim', entityId: claim.id, summary: 'Claim cancelled' });

    return res.json({ success: true, message: 'Claim cancelled.', data: { claim: serializeClaim(claim, req.user) } });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/claims/:id/collect — verify the pickup code and close the case. */
async function collectClaim(req, res, next) {
  try {
    const { pickupCode } = req.validated;
    const claim = await Claim.findByPk(req.params.id);
    if (!claim) return res.status(404).json({ success: false, message: 'Claim not found.' });
    if (claim.status !== 'approved') {
      return res.status(400).json({ success: false, message: `This claim is ${claim.status}, not awaiting collection.` });
    }
    if (String(claim.pickupCode).toUpperCase() !== String(pickupCode).toUpperCase()) {
      return res.status(400).json({ success: false, message: 'That pickup code does not match this claim.' });
    }

    await claim.update({ status: 'collected', collectedAt: new Date() });

    const item = await Item.findByPk(claim.itemId);
    if (item) {
      await item.update({ status: 'returned', returnedAt: new Date() });
      await notify({
        userId: item.reporterId,
        type: 'item.returned',
        title: 'Item returned to its owner',
        message: `"${item.title}" has been collected. Thank you for reporting it.`,
        link: `/item.html?id=${item.id}`,
      });
    }
    await notify({
      userId: claim.claimantId,
      type: 'claim.collected',
      title: 'Handover complete',
      message: 'Your claim is closed. Thanks for using the portal.',
      link: '/dashboard.html?tab=my-claims',
    });
    await audit(req, { action: 'claim.collect', entityType: 'Claim', entityId: claim.id, summary: `Handover recorded for item ${claim.itemId}` });

    return res.json({
      success: true,
      message: 'Handover recorded. Item marked as returned.',
      data: { claim: serializeClaim(claim, req.user) },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/claims/:id/proof
 * The claimant and administrators may look at the evidence. Everyone else gets
 * 403, and the object itself is never public.
 */
async function claimProofUrl(req, res, next) {
  try {
    const claim = await Claim.findByPk(req.params.id);
    if (!claim) return res.status(404).json({ success: false, message: 'Claim not found.' });

    const isClaimant = String(claim.claimantId) === String(req.user.id);
    if (!isClaimant && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You cannot view this evidence.' });
    }
    if (!claim.proofImage) {
      return res.json({ success: true, data: { url: null } });
    }

    if (storage.adapter() === 'supabase') {
      const url = await storage.signedUrl({ bucket: storage.PROOF_BUCKET(), key: claim.proofImage, expiresIn: 300 });
      return res.json({ success: true, data: { url } });
    }

    // Local adapter: a short-lived, claim-scoped token stands in for a signature.
    const token = jwt.sign(
      { claim: String(claim.id), purpose: 'proof' },
      process.env.JWT_SECRET,
      { expiresIn: '5m' }
    );
    return res.json({ success: true, data: { url: `/api/claims/${claim.id}/proof/raw?t=${token}` } });
  } catch (err) {
    return next(err);
  }
}

/** Streams a locally stored proof file for a valid short-lived token. */
async function claimProofFile(req, res) {
  try {
    const payload = jwt.verify(String(req.query.t || ''), process.env.JWT_SECRET);
    if (payload.purpose !== 'proof' || String(payload.claim) !== String(req.params.id)) {
      return res.status(403).json({ success: false, message: 'That link is not valid.' });
    }
    const claim = await Claim.findByPk(req.params.id);
    if (!claim || !claim.proofImage) {
      return res.status(404).json({ success: false, message: 'No evidence on this claim.' });
    }
    const file = storage.localPrivatePath(claim.proofImage);
    if (!file) return res.status(404).json({ success: false, message: 'Evidence file is missing.' });
    return res.sendFile(file);
  } catch {
    return res.status(403).json({ success: false, message: 'That link has expired.' });
  }
}

module.exports = {
  createClaim, myClaims, listClaims, decideClaim, cancelClaim, collectClaim,
  claimProofUrl, claimProofFile,
};
