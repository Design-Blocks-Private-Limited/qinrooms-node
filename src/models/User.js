const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // We use the Firebase UID as the MongoDB _id
    name: { type: String, required: true },
    email: { type: String, required: true },
    phoneNumber: { type: String },
    photoURL: { type: String, default: null },
    isHost: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);