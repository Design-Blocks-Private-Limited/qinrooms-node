const express = require('express');
const router = express.Router();
const SupportTicket = require('../models/SupportTicket');
const { requireAuth } = require('../middlewares/authMiddleware');

// 1. GET ACTIVE CHAT HISTORY (For Mobile App)
router.get('/', requireAuth, async (req, res) => {
    try {
        const ticket = await SupportTicket.findOne({ userId: req.user.uid, status: 'open' });
        res.json(ticket || { messages: [] });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch support chat.' });
    }
});

// 2. SEND A NEW MESSAGE IN CHAT (For Mobile App)
router.post('/message', requireAuth, async (req, res) => {
    try {
        const { text, userName } = req.body;
        
        if (!text || !text.trim()) {
            return res.status(400).json({ error: 'Message cannot be empty.' });
        }

        let ticket = await SupportTicket.findOne({ userId: req.user.uid, status: 'open' });

        // If the user doesn't have an open ticket, create a new chat session
        if (!ticket) {
            ticket = new SupportTicket({
                userId: req.user.uid,
                userName: userName || req.user.name || "Guest User",
                messages: []
            });
        }

        // Push the new message to the chat
        ticket.messages.push({
            sender: 'user',
            text: text.trim()
        });

        await ticket.save();
        res.status(201).json(ticket);

    } catch (error) {
        console.error("Error sending support message:", error);
        res.status(500).json({ error: 'Failed to send message.' });
    }
});

module.exports = router;