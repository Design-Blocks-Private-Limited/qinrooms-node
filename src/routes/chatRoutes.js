const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const { requireAuth } = require('../middlewares/authMiddleware');

// ==========================================
// 1. CHAT THREAD MANAGEMENT (Booking & Inbox)
// ==========================================

// POST: Create or Merge a Chat Document (Triggered when a booking is confirmed)
router.post('/', requireAuth, async (req, res) => {
    try {
        const { chatId, ...chatData } = req.body;

        // Uses upsert: creates the chat if it doesn't exist, updates it if it does
        const chat = await Chat.findOneAndUpdate(
            { chatId: chatId }, // Matches the "user1_user2" string format
            { $set: { ...chatData, lastUpdated: new Date() } },
            { new: true, upsert: true }
        );

        res.status(201).json(chat);
    } catch (error) {
        console.error("Failed to create chat:", error);
        res.status(500).json({ error: 'Failed to create chat' });
    }
});

// GET: All chat threads for a user (Filtered by Role for Inbox)
router.get('/', requireAuth, async (req, res) => {
    try {
        const { role } = req.query; // 'host' or 'guest'
        
        // Base query: Must be a participant
        const filter = { participants: req.user.uid };

        // Apply strict role filtering so hosts don't see their guest trips in the host inbox
        if (role === 'host') {
            filter.hostId = req.user.uid;
        } else if (role === 'guest') {
            filter.guestId = req.user.uid;
        }

        const chats = await Chat.find(filter).sort({ lastUpdated: -1 });
        
        const formatted = chats.map(c => ({ id: c._id, ...c._doc }));
        res.json(formatted);
    } catch (error) {
        console.error("Inbox fetch error:", error);
        res.status(500).json({ error: 'Failed to fetch inbox' });
    }
});


// ==========================================
// 2. MESSAGING LOGIC (Socket.io Integration)
// ==========================================

// GET: All messages for a specific chat
router.get('/:chatId/messages', requireAuth, async (req, res) => {
    try {
        const messages = await Message.find({ chatId: req.params.chatId })
                                      .sort({ createdAt: -1 }); // Newest first
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// POST: A new message
router.post('/:chatId/messages', requireAuth, async (req, res) => {
    try {
        const { message } = req.body;
        const chatId = req.params.chatId;

        // 1. Save the new message
        const newMessage = new Message({
            ...message,
            chatId: chatId,
            createdAt: new Date()
        });
        await newMessage.save();

        // 2. Update the parent Chat document
        let lastMsgText = message.text;
        if (!lastMsgText) lastMsgText = message.image ? "📷 Image" : "📍 Location";

        // Note: Using findOneAndUpdate to match the chatId string rather than Mongo's _id
        await Chat.findOneAndUpdate(
            { chatId: chatId }, 
            {
                lastMessage: lastMsgText,
                lastUpdated: new Date()
            }
        );

        // ✅ 3. MAGIC HAPPENS HERE: Broadcast to the Socket Room instantly
        const io = req.app.get('io');
        io.to(chatId).emit('receive_message', newMessage);

        res.status(201).json(newMessage);
    } catch (error) {
        console.error("Save message error:", error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

module.exports = router;