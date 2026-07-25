const mongoose = require('mongoose');

const WithdrawalRequestSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true }, // Refers to User._id (uid string)
    amount: { type: Number, required: true },
    bankName: { type: String, required: true },
    accountName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    ifsc: { type: String, required: true },
    bankDocumentUrl: { type: String, required: true },
    status: { type: String, enum: ['pending', 'completed', 'rejected'], default: 'pending' },
}, { timestamps: true });

module.exports = mongoose.model('WithdrawalRequest', WithdrawalRequestSchema);
