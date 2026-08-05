const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middlewares/authMiddleware');
const { getMyProfile, updateMyProfile, registerUser, savePushToken, signupUser, loginUser, submitVerification, requestOTP, verifyOTP } = require('../controllers/userController');
const User = require('../models/User'); 

// Security: Rate limiting for auth routes (increased for dev testing)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 50,
    message: { error: 'Too many login attempts. Please try again after 15 minutes.' }
});

router.post('/signup', authLimiter, signupUser);
router.post('/login', authLimiter, loginUser);
router.post('/request-otp', authLimiter, requestOTP);
router.post('/verify-otp', authLimiter, verifyOTP);

router.get('/me', requireAuth, getMyProfile);
router.patch('/me', requireAuth, updateMyProfile);
router.post('/me/verify', requireAuth, submitVerification);
router.post('/register', requireAuth, registerUser);
router.post('/delete-request', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.user.uid);
        if (user && user.deleteRequested) {
             return res.status(400).json({ error: "You have already submitted a delete request." });
        }
        await User.findByIdAndUpdate(req.user.uid, { $set: { deleteRequested: true } });

        res.status(200).json({ success: true, message: "Deletion request received and pending admin approval." });
    } catch (error) {

        res.status(500).json({ error: "Failed to process delete request." });
    }
});

// ✅ SAVE PUSH TOKEN ROUTE
router.post('/push-token', requireAuth, savePushToken);

// --- ADDRESS MANAGEMENT ROUTES ---
router.get('/me/addresses', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.user.uid); 
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(user.addresses || []);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch addresses" });
    }
});

router.post('/me/addresses', requireAuth, async (req, res) => {
    try {
        const { label, address, latitude, longitude, icon } = req.body;
        const user = await User.findById(req.user.uid);
        if (!user) return res.status(404).json({ error: "User not found" });

        const newAddress = { label, address, latitude, longitude, icon };
        user.addresses.unshift(newAddress);
        await user.save();

        res.status(201).json(user.addresses[0]); 
    } catch (error) {
        res.status(500).json({ error: "Failed to save address" });
    }
});

module.exports = router;