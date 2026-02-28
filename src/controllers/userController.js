const User = require('../models/User');

// --- 1. GET CURRENT USER PROFILE ---
const getMyProfile = async (req, res) => {
    try {
        // req.user.uid is securely provided by the authMiddleware
        const user = await User.findById(req.user.uid);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json(user);
    } catch (error) {
        console.error("Fetch profile error:", error);
        res.status(500).json({ error: 'Server error fetching profile' });
    }
};

// --- 2. UPDATE CURRENT USER PROFILE ---
const updateMyProfile = async (req, res) => {
    try {
        // Only update the fields provided in the request body
        const updatedUser = await User.findByIdAndUpdate(
            req.user.uid, 
            { $set: req.body }, 
            { new: true } // Returns the updated document instead of the old one
        );
        
        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(updatedUser);
    } catch (error) {
        console.error("Update profile error:", error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
};

// --- 3. REGISTER NEW USER IN MONGODB ---
const registerUser = async (req, res) => {
    try {
        const { name, phoneNumber, email, isHost } = req.body;
        
        // Create the new user mapping the Firebase UID directly to the MongoDB _id
        const newUser = new User({
            _id: req.user.uid, 
            name,
            phoneNumber,
            email,
            isHost: isHost || false
        });

        await newUser.save();
        
        res.status(201).json(newUser);
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ error: 'Failed to create user profile in database' });
    }
};

module.exports = { 
    getMyProfile, 
    updateMyProfile, 
    registerUser 
};