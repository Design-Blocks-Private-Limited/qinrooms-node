const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema({
    userId: { type: String, required: true }, // Firebase UID
    userName: { type: String, required: true },
    issue: { type: String, required: true },
    status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' },
    adminReply: { type: String, default: null } // So admins can reply later!
}, { timestamps: true });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);