const express = require('express');
const c = require('../controllers/notificationController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, c.listNotifications);
router.post('/read-all', requireAuth, c.markAllRead);
router.patch('/:id/read', requireAuth, c.markRead);

module.exports = router;
