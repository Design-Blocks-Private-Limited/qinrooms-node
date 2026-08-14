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

const optionalAuth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split('Bearer ')[1];
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_qin_jwt_key_2026');
            const user = await User.findById(decoded.id);
            if (user) {
                req.user = {
                    id: user._id.toString(),
                    uid: user._id.toString(),
                    email: user.email,
                    phoneNumber: user.phoneNumber,
                    name: user.name
                };
            }
        }
    } catch (error) {
        // Token invalid or missing, proceed as guest
    }
    next();
};

module.exports = { requireAuth, requireAdmin, optionalAuth }; // 👈 Export all