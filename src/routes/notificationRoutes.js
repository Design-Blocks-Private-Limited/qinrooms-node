const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { requireAuth } = require('../middlewares/authMiddleware');

// GET all notifications for the logged-in user
router.get('/', requireAuth, async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.user.uid })
            .sort({ createdAt: -1 })
            .limit(50); // Only send the latest 50 to keep the app fast
        
        // Format for React Native (_id to id)
        const formatted = notifications.map(n => ({ id: n._id, ...n._doc }));
        res.json(formatted);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// GET unread count for the Bell Icon badge
router.get('/unread-count', requireAuth, async (req, res) => {
    try {
        const count = await Notification.countDocuments({ userId: req.user.uid, isRead: false });
        res.json({ count });
    } catch (error) {
        res.status(500).json({ error: 'Failed to count notifications' });
    }
});

// PUT mark a notification as read
router.put('/:id/read', requireAuth, async (req, res) => {
    try {
        await Notification.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.uid },
            { isRead: true }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update notification' });
    }
});

// PUT mark all as read (Great for a "Clear All" button)
router.put('/read-all', requireAuth, async (req, res) => {
    try {
        await Notification.updateMany(
            { userId: req.user.uid, isRead: false },
            { isRead: true }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update notifications' });
    }
});

module.exports = router;