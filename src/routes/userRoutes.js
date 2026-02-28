const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/authMiddleware');
const { getMyProfile, updateMyProfile, registerUser } = require('../controllers/userController');

router.get('/me', requireAuth, getMyProfile);
router.patch('/me', requireAuth, updateMyProfile);

// ✅ NEW ROUTE: Create the user in MongoDB
router.post('/register', requireAuth, registerUser);

module.exports = router;