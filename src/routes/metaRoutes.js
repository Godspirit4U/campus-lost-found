const express = require('express');
const c = require('../controllers/metaController');

const router = express.Router();

router.get('/categories', c.categories);
router.get('/locations', c.locations);
router.get('/health', c.health);

module.exports = router;
