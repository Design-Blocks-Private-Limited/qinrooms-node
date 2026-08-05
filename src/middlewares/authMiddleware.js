const jwt = require('jsonwebtoken');
const User = require('../models/User'); // 👈 Import your MongoDB User model

const requireAuth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split('Bearer ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized: No token provided' });
        }

        // Verify token with JWT
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_qin_jwt_key_2026');
        
        // Find user in MongoDB
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized: User not found' });
        }

        // Attach user info to the request
        req.user = {
            id: user._id.toString(),
            uid: user._id.toString(), // Keep uid for legacy compatibility with other controllers
            email: user.email,
            phoneNumber: user.phoneNumber,
        };
        
        next(); // Proceed to the actual route
    } catch (error) {

        res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

// 👇 NEW: Master Admin Check 👇
const requireAdmin = async (req, res, next) => {
    try {
        // We assume requireAuth runs first, so req.user is already populated
        const uid = req.user.uid;

        // Find the user in MongoDB
        const user = await User.findById(uid);

        // Check if they exist AND are an admin
        if (!user || user.isAdmin !== true) {
            return res.status(403).json({ error: 'Forbidden: Master Admin access required' });
        }

        next(); // They have the master key! Proceed to the route.
    } catch (error) {

        res.status(500).json({ error: 'Server error checking admin privileges' });
    }
};

module.exports = { requireAuth, requireAdmin }; // 👈 Export both