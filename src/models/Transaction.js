const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true }, // Refers to User.uid
    amount: { type: Number, required: true },
    type: { type: String, enum: ['credit', 'debit'], required: true },
    description: { type: String, required: true },
    bookingId: { type: String }, // Optional link to a specific booking
    withdrawalId: { type: String }, // Optional link to a specific withdrawal request
}, { timestamps: true });

module.exports = mongoose.model('Transaction', TransactionSchema);
