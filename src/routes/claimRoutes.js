const express = require('express');
const c = require('../controllers/claimController');
const { validate } = require('../middleware/validate');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { decideClaimSchema, collectClaimSchema } = require('../utils/schemas');

const router = express.Router();

router.get('/mine', requireAuth, c.myClaims);
router.get('/', requireAuth, requireAdmin, c.listClaims);
router.patch('/:id', requireAuth, requireAdmin, validate(decideClaimSchema), c.decideClaim);
router.patch('/:id/cancel', requireAuth, c.cancelClaim);
router.post('/:id/collect', requireAuth, requireAdmin, validate(collectClaimSchema), c.collectClaim);
// Claim evidence is private: a signed link is issued to authorised callers only.
router.get('/:id/proof', requireAuth, c.claimProofUrl);
router.get('/:id/proof/raw', c.claimProofFile);

module.exports = router;
