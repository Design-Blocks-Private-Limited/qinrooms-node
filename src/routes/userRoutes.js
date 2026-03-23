const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/authMiddleware');
const { getMyProfile, updateMyProfile, registerUser } = require('../controllers/userController');
const User = require('../models/User'); // ✅ REQUIRED to interact with the database here

router.get('/me', requireAuth, getMyProfile);
router.patch('/me', requireAuth, updateMyProfile);

// ✅ Create the user in MongoDB
router.post('/register', requireAuth, registerUser);

// ---------------------------------------------------------
// ✅ NEW: ADDRESS MANAGEMENT ROUTES
// ---------------------------------------------------------

// 1. GET USER'S SAVED ADDRESSES
router.get('/me/addresses', requireAuth, async (req, res) => {
    try {
        // Find user by their Firebase UID (which maps to _id)
        const user = await User.findById(req.user.uid); 
        if (!user) return res.status(404).json({ error: "User not found" });
        
        res.json(user.addresses || []);
    } catch (error) {
        console.error("Error fetching addresses:", error);
        res.status(500).json({ error: "Failed to fetch addresses" });
    }
});

// 2. SAVE A NEW ADDRESS
router.post('/me/addresses', requireAuth, async (req, res) => {
    try {
        const { label, address, latitude, longitude, icon } = req.body;
        
        const user = await User.findById(req.user.uid);
        if (!user) return res.status(404).json({ error: "User not found" });

        const newAddress = { label, address, latitude, longitude, icon };
        
        // Add to the top of the array so newest is first
        user.addresses.unshift(newAddress);
        await user.save();

        // Return the newly created address (which now includes MongoDB's generated _id)
        res.status(201).json(user.addresses[0]); 
    } catch (error) {
        console.error("Error saving address:", error);
        res.status(500).json({ error: "Failed to save address" });
    }
});

module.exports = router;