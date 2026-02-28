const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // GiftedChat's custom string ID
    chatId: { type: String, required: true, index: true },
    text: { type: String, default: "" },
    image: { type: String, default: null },
    location: { type: Object, default: null },
    createdAt: { type: Date, default: Date.now },
    user: { type: Object, required: true }
}, { _id: false, timestamps: true }); // Disable auto _id since we provide our own

module.exports = mongoose.model('Message', MessageSchema);