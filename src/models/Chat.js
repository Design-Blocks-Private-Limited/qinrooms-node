const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema({
    // ✅ ADDED: chatId is required for the findOneAndUpdate logic in bookingRoutes
    chatId: { type: String, required: true, unique: true }, 
    
    participants: [{ type: String }],
    guestId: { type: String, required: true },
    hostId: { type: String, required: true },
    
    // Using a Map for userDetails allows flexible key-value storage for guest/host info
    userDetails: { type: Map, of: Object },
    
    lastMessage: { type: String },
    lastUpdated: { type: Date, default: Date.now }
}, { 
    timestamps: true 
});

// Check if model exists before defining to prevent OverwriteModelError in some Node environments
module.exports = mongoose.models.Chat || mongoose.model('Chat', ChatSchema);