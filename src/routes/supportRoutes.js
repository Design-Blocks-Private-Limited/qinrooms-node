const express = require('express');
const router = express.Router();
const SupportTicket = require('../models/SupportTicket');
const { requireAuth } = require('../middlewares/authMiddleware');

// CREATE A NEW SUPPORT TICKET (From Mobile App)
router.post('/', requireAuth, async (req, res) => {
    try {
        const { issue } = req.body;
        
        if (!issue || issue.trim().length === 0) {
            return res.status(400).json({ error: 'Please describe your issue.' });
        }

        const ticket = new SupportTicket({
            userId: req.user.uid,
            userName: req.user.name || req.body.userName || "Guest User",
            issue: issue.trim()
        });

        await ticket.save();
        res.status(201).json({ message: 'Ticket submitted successfully.', ticket });

    } catch (error) {
        console.error("Error creating support ticket:", error);
        res.status(500).json({ error: 'Failed to submit issue.' });
    }
});

module.exports = router;