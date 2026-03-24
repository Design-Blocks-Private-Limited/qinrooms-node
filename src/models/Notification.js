const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    userId: { type: String, required: true }, // The Firebase UID of the receiver
    title: { type: String, required: true },
    body: { type: String, required: true },
    type: { 
        type: String, 
        enum: ['booking', 'message', 'review', 'reminder', 'admin_broadcast', 'system'],
        default: 'system'
    },
    relatedId: { type: String }, // e.g., the bookingId or listingId so they can click it
    isRead: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Notification', NotificationSchema);