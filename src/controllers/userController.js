const User = require('../models/User');

// --- 1. GET CURRENT USER PROFILE ---
const getMyProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.uid);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (error) {
        console.error("Fetch profile error:", error);
        res.status(500).json({ error: 'Server error fetching profile' });
    }
};

// --- 2. UPDATE CURRENT USER PROFILE ---
const updateMyProfile = async (req, res) => {
    try {
        const updatedUser = await User.findByIdAndUpdate(
            req.user.uid, 
            { $set: req.body }, 
            { new: true }
        );
        if (!updatedUser) return res.status(404).json({ error: 'User not found' });
        res.json(updatedUser);
    } catch (error) {
        console.error("Update profile error:", error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
};

// --- 3. REGISTER OR LOGIN USER IN MONGODB ---
const registerUser = async (req, res) => {
    try {
        const { name, phoneNumber, email, isHost, photoURL } = req.body;
        
        let existingUser = await User.findById(req.user.uid);
        if (existingUser) {
            return res.status(200).json(existingUser);
        }

        const newUser = new User({
            _id: req.user.uid, 
            name: name || "New User",
            phoneNumber: phoneNumber || "", 
            email: email,
            photoURL: photoURL || null,     
            isHost: isHost || false
        });

        await newUser.save();
        res.status(201).json(newUser);
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ error: 'Failed to create user profile in database' });
    }
};

// --- 4. SAVE EXPO PUSH TOKEN ---
const savePushToken = async (req, res) => {
    try {
        const { pushToken } = req.body;
        await User.findByIdAndUpdate(req.user.uid, { pushToken });
        res.status(200).json({ message: "Push token saved" });
    } catch (error) {
        res.status(500).json({ error: "Failed to save push token" });
    }
};

module.exports = { 
    getMyProfile, 
    updateMyProfile, 
    registerUser,
    savePushToken
};