const express = require('express');
const c = require('../controllers/adminController');
const { validate } = require('../middleware/validate');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { updateUserSchema } = require('../utils/schemas');

const router = express.Router();

// Every route in this file is administrator-only.
router.use(requireAuth, requireAdmin);

router.get('/stats', c.stats);
router.get('/charts', c.charts);
router.get('/items', c.allItems);
router.get('/users', c.listUsers);
router.patch('/users/:id', validate(updateUserSchema), c.updateUser);
router.delete('/users/:id', c.deleteUser);
router.get('/audit-log', c.auditLog);
router.get('/duplicates', c.duplicates);

module.exports = router;
