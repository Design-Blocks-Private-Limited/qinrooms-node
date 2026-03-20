const express = require('express');
const router = express.Router();
const SupportTicket = require('../models/SupportTicket');
const { requireAuth } = require('../middlewares/authMiddleware');

// 1. GET ACTIVE CHAT HISTORY
router.get('/', requireAuth, async (req, res) => {
    try {
        const ticket = await SupportTicket.findOne({ userId: req.user.uid, status: 'open' });
        res.json(ticket || { messages: [] });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch support chat.' });
    }
});

// 2. SEND A NEW MESSAGE IN CHAT
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

const SupportTicket = require('../models/SupportTicket');

// 1. GET ALL SUPPORT TICKETS
router.get('/support-tickets', async (req, res) => {
    try {
        const tickets = await SupportTicket.find().sort({ updatedAt: -1 });
        res.json(tickets);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch tickets' });
    }
});

// 2. ADMIN REPLIES TO A TICKET
router.post('/support-tickets/:ticketId/message', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || !text.trim()) return res.status(400).json({ error: 'Message empty' });

        const ticket = await SupportTicket.findById(req.params.ticketId);
        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

        ticket.messages.push({
            sender: 'admin',
            text: text.trim()
        });
        
        // Re-open the ticket if the admin replies to a resolved one
        if (ticket.status === 'resolved') ticket.status = 'open';

        await ticket.save();
        res.json(ticket);
    } catch (error) {
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// 3. MARK TICKET AS RESOLVED
router.patch('/support-tickets/:ticketId/resolve', async (req, res) => {
    try {
        const ticket = await SupportTicket.findByIdAndUpdate(
            req.params.ticketId, 
            { status: 'resolved' }, 
            { new: true }
        );
        res.json(ticket);
    } catch (error) {
        res.status(500).json({ error: 'Failed to resolve ticket' });
    }
});

module.exports = router;