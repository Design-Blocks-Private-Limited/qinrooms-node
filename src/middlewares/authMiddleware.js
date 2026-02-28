const admin = require('../config/firebase');

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

module.exports = { requireAuth };