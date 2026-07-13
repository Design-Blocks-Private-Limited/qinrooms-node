const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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
        if (req.body.phoneNumber) {
            const cleanPhone = req.body.phoneNumber.replace(/[^0-9]/g, '');
            if (cleanPhone.length !== 10) {
                return res.status(400).json({ error: 'Phone number must be exactly 10 digits.' });
            }
            req.body.phoneNumber = cleanPhone; // Ensure only numbers are saved
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user.uid, 
            { $set: req.body }, 
            { new: true, returnDocument: 'after' } // fixed mongoose deprecation warning while we are here
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
        // ✅ FIX: Match the 'token' key sent by the React Native frontend
        const { token } = req.body; 
        
        if (!token) return res.status(400).json({ error: "Token is required" });

        // ✅ FIX: Save it to the 'pushToken' field in MongoDB
        await User.findByIdAndUpdate(
            req.user.uid, 
            { $set: { pushToken: token } },
            { new: true }
        );
        
        res.status(200).json({ message: "Push token saved successfully!" });
    } catch (error) {
        console.error("Save token error:", error);
        res.status(500).json({ error: "Failed to save push token" });
    }
};

// --- 5. SIGNUP USER (CUSTOM MONGODB AUTH) ---
const signupUser = async (req, res) => {
    try {
        const { name, phoneNumber, password, email, isHost, photoURL } = req.body;

        if (!phoneNumber || !password || !name) {
            return res.status(400).json({ error: 'Name, phone number, and password are required.' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ phoneNumber });
        if (existingUser) {
            return res.status(400).json({ error: 'A user with this phone number already exists.' });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name: name || "New User",
            email: email || "",
            phoneNumber,
            password: hashedPassword,
            photoURL: photoURL || null,
            isHost: isHost || false,
            isAdmin: req.body.isAdmin || false
        });

        await newUser.save();

        // Sign JWT
        const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET || 'secret_qin_jwt_key_2026', { expiresIn: '30d' });

        res.status(201).json({
            success: true,
            token,
            user: {
                id: newUser._id,
                name: newUser.name,
                phoneNumber: newUser.phoneNumber,
                email: newUser.email,
                isHost: newUser.isHost,
                isAdmin: newUser.isAdmin,
                photoURL: newUser.photoURL
            }
        });
    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).json({ error: 'Failed to register user in database' });
    }
};

// --- 6. LOGIN USER (CUSTOM MONGODB AUTH) ---
const loginUser = async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;

        if (!phoneNumber || !password) {
            return res.status(400).json({ error: 'Phone number/email and password are required.' });
        }

        // Find user by phoneNumber or email
        const user = await User.findOne({
            $or: [
                { phoneNumber: phoneNumber },
                { email: phoneNumber }
            ]
        });
        if (!user) {
            return res.status(401).json({ error: 'Incorrect phone number/email or password.' });
        }

        if (!user.password) {
            return res.status(401).json({ error: 'Incorrect phone number or password.' });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Incorrect phone number or password.' });
        }

        // Sign JWT
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret_qin_jwt_key_2026', { expiresIn: '30d' });

        res.status(200).json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                phoneNumber: user.phoneNumber,
                email: user.email,
                isHost: user.isHost,
                isAdmin: user.isAdmin,
                photoURL: user.photoURL
            }
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: 'Server error during login' });
    }
};

module.exports = { 
    getMyProfile, 
    updateMyProfile, 
    registerUser,
    savePushToken,
    signupUser,
    loginUser
};