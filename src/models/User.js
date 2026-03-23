const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // We use the Firebase UID as the MongoDB _id
    name: { type: String, required: true },
    email: { type: String, required: true },
    phoneNumber: { type: String },
    photoURL: { type: String, default: null },
    isHost: { type: Boolean, default: false },
    
    // 👇 ADD THIS LINE FOR THE MASTER ADMIN PANEL 👇
    isAdmin: { type: Boolean, default: false }, 
    
    // ✅ ADDED THIS BLOCK FOR SAVED ADDRESSES
    addresses: [{
        label: String, // e.g., "Home", "Work"
        address: String, // e.g., "123 Main St, Visakhapatnam"
        latitude: Number,
        longitude: Number,
        icon: { type: String, default: 'location' }
    }]
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);