const mongoose = require('mongoose');

const walkInGuestSchema = new mongoose.Schema({
    hostId: {
        type: String,
        required: true,
        index: true
    },
    listingId: {
        type: String,
        index: true
    },
    bookerName: {
        type: String,
        required: true
    },
    bookerEmail: {
        type: String,
        default: ''
    },
    bookerPhone: {
        type: String,
        required: true,
        index: true
    },
    guestIdType: {
        type: String,
        default: 'Aadhaar'
    },
    guestIdNumber: {
        type: String,
        default: ''
    },
    guestIdImage: {
        type: String,
        default: ''
    },
    visitCount: {
        type: Number,
        default: 1
    },
    lastStayDate: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Compound index for fast lookup per host and phone/email
walkInGuestSchema.index({ hostId: 1, bookerPhone: 1 });
walkInGuestSchema.index({ hostId: 1, bookerEmail: 1 });

module.exports = mongoose.model('WalkInGuest', walkInGuestSchema);
