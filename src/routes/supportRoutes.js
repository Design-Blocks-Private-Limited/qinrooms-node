const express = require('express');
const router = express.Router();
const SupportTicket = require('../models/SupportTicket');
const { requireAuth } = require('../middlewares/authMiddleware');

// 1. GET ACTIVE CHAT HISTORY (For Mobile App)
router.get('/', requireAuth, async (req, res) => {
    try {
        const ticket = await SupportTicket.findOne({ userId: req.user.uid }).sort({ createdAt: -1 });
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

        let ticket = await SupportTicket.findOne({ userId: req.user.uid }).sort({ createdAt: -1 });
        let isNewOrReopened = false;

        // If the user doesn't have an open ticket, create a new chat session
        if (!ticket) {
            isNewOrReopened = true;
            ticket = new SupportTicket({
                userId: req.user.uid,
                userName: userName || req.user.name || "Guest User",
                userEmail: req.user.email || req.body.userEmail || "",
                userPhone: req.user.phoneNumber || req.body.userPhone || "",
                messages: []
            });
        } else if (ticket.status === 'resolved') {
            ticket.status = 'open';
            ticket.rating = null; // reset rating on reopen
            isNewOrReopened = 'reopened';
        }

        // Push the new message to the chat
        ticket.messages.push({
            sender: 'user',
            text: text.trim()
        });

        // Add automated message if new or reopened
        if (isNewOrReopened === true) {
            ticket.messages.push({
                sender: 'system',
                text: 'Welcome to Qin Rooms, our executive will contact you soon.'
            });
        } else if (isNewOrReopened === 'reopened') {
            ticket.messages.push({
                sender: 'system',
                text: 'The ticket has been opened for an issue. The executive will contact you soon.'
            });
        }

        await ticket.save();

        // Broadcast the new message via Socket.io
        try {
            const io = req.app.get('io');
            const roomName = `support_${ticket._id}`;
            
            // The user's message is always pushed before the optional system message
            // If it's new/reopened, the user message is at length-2, else length-1
            const userMsgIndex = isNewOrReopened ? ticket.messages.length - 2 : ticket.messages.length - 1;
            const userMsg = ticket.messages[userMsgIndex];
            
            io.to(roomName).emit('receive_support_message', { ticketId: ticket._id, message: userMsg });
            io.to('support_admins').emit('receive_support_message', { ticketId: ticket._id, message: userMsg });
            
            // If this is a newly created ticket, or just reopened, broadcast creation event and system message to admins
            if (isNewOrReopened) {
                const sysMsg = ticket.messages[ticket.messages.length - 1];
                if (sysMsg.sender === 'system') {
                    io.to(roomName).emit('receive_support_message', { ticketId: ticket._id, message: sysMsg });
                    io.to('support_admins').emit('receive_support_message', { ticketId: ticket._id, message: sysMsg });
                }

                io.to('support_admins').emit('support_ticket_created', ticket);
            }
        } catch (socketError) {
            console.error("Failed to broadcast support message via socket:", socketError);
        }

        res.status(201).json(ticket);

    } catch (error) {
        console.error("Error sending support message:", error);
        res.status(500).json({ error: 'Failed to send message.' });
    }
});

// 3. SUBMIT TICKET RATING
router.patch('/rate', requireAuth, async (req, res) => {
    try {
        const { ticketId, rating } = req.body;
        if (!ticketId || !rating) return res.status(400).json({ error: 'Missing rating details.' });

        const ticket = await SupportTicket.findOneAndUpdate(
            { _id: ticketId, userId: req.user.uid },
            { $set: { rating } },
            { new: true }
        );

        if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

        res.json(ticket);
    } catch (error) {
        console.error("Error submitting rating:", error);
        res.status(500).json({ error: 'Failed to submit rating.' });
    }
});

module.exports = router;