const mongoose = require('mongoose');

const OtpSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, index: true },
    otp: { type: String, required: true },
    requestCount: { type: Number, default: 1 },
    lastRequestedAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now, expires: 3600 } // Auto-deletes after 1 hour
}, { timestamps: true });

module.exports = mongoose.model('Otp', OtpSchema);

