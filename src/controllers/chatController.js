const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const { sendNotification } = require('../utils/notificationUtils');
const { getPaginationParams, formatPaginatedResponse } = require('../utils/pagination');

// 1. CREATE OR MERGE A CHAT DOCUMENT (Triggered when booking/messaging starts)
const createOrUpdateChat = async (req, res) => {
    try {
        const { chatId, ...chatData } = req.body;

        const chat = await Chat.findOneAndUpdate(
            { chatId: chatId }, 
            { $set: { ...chatData, lastUpdated: new Date() } },
            { new: true, upsert: true }
        );

        res.status(201).json(chat);
    } catch (error) {

        res.status(500).json({ error: 'Failed to create chat' });
    }
};

// 2. GET ALL CHAT THREADS FOR A USER (Filtered by Role for Inbox)
const getUserChats = async (req, res) => {
    try {
        const { role } = req.query; 
        
        const filter = { participants: req.user.uid };

        if (role === 'host') {
            filter.hostId = req.user.uid;
        } else if (role === 'guest') {
            filter.guestId = req.user.uid;
        }

        const { page, limit, skip } = getPaginationParams(req.query);

        const total = await Chat.countDocuments(filter);
        const chats = await Chat.find(filter)
            .sort({ lastUpdated: -1 })
            .skip(skip)
            .limit(limit);
        
        const formatted = chats.map(c => ({ id: c._id, ...c._doc }));
        res.json(formatPaginatedResponse(formatted, total, page, limit));
    } catch (error) {

        res.status(500).json({ error: 'Failed to fetch inbox' });
    }
};

// 3. GET ALL MESSAGES FOR A SPECIFIC CHAT
const getChatMessages = async (req, res) => {
    try {
        const { page, limit, skip } = getPaginationParams(req.query);
        const filter = { chatId: req.params.chatId };

        const total = await Message.countDocuments(filter);
        const messages = await Message.find(filter)
                                      .sort({ createdAt: -1 })
                                      .skip(skip)
                                      .limit(limit);
        res.json(formatPaginatedResponse(messages, total, page, limit));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
};

// 4. SEND A NEW MESSAGE (Saves to DB, Emits to Socket, Sends Push Notification)
const sendMessage = async (req, res) => {
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

        const updatedChat = await Chat.findOneAndUpdate(
            { chatId: chatId }, 
            {
                $set: {
                    lastMessage: lastMsgText,
                    lastUpdated: new Date()
                }
            },
            { new: true } // Return updated doc to get participants
        );

        // 3. Broadcast to the Socket Room instantly
        try {
            const io = req.app.get('io');
            if (io) {
                io.to(chatId).emit('receive_message', newMessage);
            } else {

            }
        } catch (socketError) {

        }

        // ✅ 4. SEND PUSH NOTIFICATION
        try {
            if (updatedChat) {
                // Find the other person in the chat
                const receiverId = updatedChat.participants.find(p => p !== req.user.uid);
                
                if (receiverId) {
                    const sender = await User.findById(req.user.uid);
                    const senderName = sender ? sender.name : "Someone";
                    const shortText = lastMsgText.length > 40 ? lastMsgText.substring(0, 40) + '...' : lastMsgText;

                    await sendNotification({
                        userId: receiverId, 
                        title: `New message from ${senderName}`,
                        body: shortText,
                        type: "message",
                        relatedId: chatId 
                    });
                }
            }
        } catch (notifError) {

        }

        res.status(201).json(newMessage);
    } catch (error) {

        res.status(500).json({ error: 'Failed to send message', details: error.message });
    }
};

module.exports = {
    createOrUpdateChat,
    getUserChats,
    getChatMessages,
    sendMessage
};