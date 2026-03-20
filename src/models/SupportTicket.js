const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender: { type: String, enum: ['user', 'admin'], required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const supportTicketSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    userEmail: { type: String, default: "" }, // ✅ NEW: Captures Email
    userPhone: { type: String, default: "" }, // ✅ NEW: Captures Phone
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    messages: [messageSchema] 
}, { timestamps: true });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);