const mongoose = require('mongoose');

const OtpSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, index: true },
    otp: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 600 } // Auto-deletes after 10 minutes (600 seconds)
}, { timestamps: true });

module.exports = mongoose.model('Otp', OtpSchema);
