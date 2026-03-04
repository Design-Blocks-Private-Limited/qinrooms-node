const admin = require('../config/firebase');
const User = require('../models/User'); // 👈 Import your MongoDB User model

const requireAuth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split('Bearer ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized: No token provided' });
        }

        // Verify token with Firebase
        const decodedToken = await admin.auth().verifyIdToken(token);
        
        // Attach user info to the request
        req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email,
        };
        
        next(); // Proceed to the actual route
    } catch (error) {
        console.error('Auth Error:', error);
        res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

// 👇 NEW: Master Admin Check 👇
const requireAdmin = async (req, res, next) => {
    try {
        // We assume requireAuth runs first, so req.user is already populated
        const uid = req.user.uid;

        // Find the user in MongoDB (since your UserSchema uses _id for the Firebase UID)
        const user = await User.findById(uid);

        // Check if they exist AND are an admin
        if (!user || user.isAdmin !== true) {
            return res.status(403).json({ error: 'Forbidden: Master Admin access required' });
        }

        next(); // They have the master key! Proceed to the route.
    } catch (error) {
        console.error('Admin Auth Error:', error);
        res.status(500).json({ error: 'Server error checking admin privileges' });
    }
};

module.exports = { requireAuth, requireAdmin }; // 👈 Export both