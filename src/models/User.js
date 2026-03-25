const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // We use the Firebase UID as the MongoDB _id
    name: { type: String, required: true },
    email: { type: String, required: true },
    phoneNumber: { type: String },
    photoURL: { type: String, default: null },
    isHost: { type: Boolean, default: false },
    isAdmin: { type: Boolean, default: false }, 
    
    // ✅ ADD THIS LINE SO MONGOOSE ALLOWS THE TOKEN TO BE SAVED!
    pushToken: { type: String, default: null },
    
    addresses: [{
        label: String, // e.g., "Home", "Work"
        address: String, // e.g., "123 Main St, Visakhapatnam"
        latitude: Number,
        longitude: Number,
        icon: { type: String, default: 'location' }
    }]
}, { timestamps: true });

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);