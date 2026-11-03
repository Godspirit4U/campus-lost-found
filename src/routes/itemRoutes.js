const express = require('express');
const c = require('../controllers/itemController');
const claimController = require('../controllers/claimController');
const { validate } = require('../middleware/validate');
const { requireAuth, requireAdmin, optionalAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const {
  createItemSchema, updateItemSchema, itemStatusSchema, createClaimSchema,
} = require('../utils/schemas');

const router = express.Router();

router.get('/', optionalAuth, c.listItems);
router.get('/mine', requireAuth, c.myItems);
router.get('/:id', optionalAuth, c.getItem);
router.get('/:id/matches', requireAuth, c.itemMatches);
router.get('/:id/claims', requireAuth, c.itemClaims);

router.post(
  '/',
  requireAuth,
  upload.array('images', 3),
  validate(createItemSchema),
  c.createItem
);
router.patch(
  '/:id',
  requireAuth,
  upload.array('images', 3),
  validate(updateItemSchema),
  c.updateItem
);
router.delete('/:id', requireAuth, c.deleteItem);
router.patch('/:id/status', requireAuth, requireAdmin, validate(itemStatusSchema), c.setStatus);

// Claims are nested under the item they are about.
router.post(
  '/:id/claims',
  requireAuth,
  upload.single('proofImage'),
  validate(createClaimSchema),
  claimController.createClaim
);

module.exports = router;
