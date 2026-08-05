const express = require('express');
const router = express.Router();
const settingController = require('../controllers/settingController');
const { requireAuth, requireAdmin } = require('../middlewares/authMiddleware');

// Get a setting by key (Public)
router.get('/:key', settingController.getSettingByKey);

// Create or update a setting by key (Admin only)
router.put('/:key', requireAuth, requireAdmin, settingController.updateSettingByKey);

module.exports = router;
