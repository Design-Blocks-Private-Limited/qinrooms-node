const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/authMiddleware');
const {
    createOrUpdateChat,
    getUserChats,
    getChatMessages,
    sendMessage
} = require('../controllers/chatController');

// ==========================================
// 1. CHAT THREAD MANAGEMENT (Booking & Inbox)
// ==========================================

// POST: Create or Merge a Chat Document
router.post('/', requireAuth, createOrUpdateChat);

// GET: All chat threads for a user (Filtered by Role for Inbox)
router.get('/', requireAuth, getUserChats);

// ==========================================
// 2. MESSAGING LOGIC (Socket.io Integration)
// ==========================================

// GET: All messages for a specific chat
router.get('/:chatId/messages', requireAuth, getChatMessages);

// POST: A new message (Saves, Emits Socket, Sends Push)
router.post('/:chatId/messages', requireAuth, sendMessage);

module.exports = router;