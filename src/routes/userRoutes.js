const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/authMiddleware');
const { getMyProfile, updateMyProfile, registerUser, savePushToken, signupUser, loginUser, submitVerification } = require('../controllers/userController');
const User = require('../models/User'); 

router.post('/signup', signupUser);
router.post('/login', loginUser);

router.get('/me', requireAuth, getMyProfile);
router.patch('/me', requireAuth, updateMyProfile);
router.post('/me/verify', requireAuth, submitVerification);
router.post('/register', requireAuth, registerUser);
router.post('/delete-request', requireAuth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user.uid, { $set: { deleteRequested: true } });
        console.log(`Delete account request from user ${req.user.uid}`);
        res.status(200).json({ success: true, message: "Deletion request received and pending admin approval." });
    } catch (error) {
        console.error("Delete request error:", error);
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