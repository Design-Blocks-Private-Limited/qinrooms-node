const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String }, 
    phoneNumber: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    photoURL: { type: String, default: null },
    isHost: { type: Boolean, default: false },
    isAdmin: { type: Boolean, default: false }, 
    
    // ✅ ADD THIS LINE SO MONGOOSE ALLOWS THE TOKEN TO BE SAVED!
    pushToken: { type: String, default: null },

    // ✅ Host Verification
    verificationStatus: { type: String, enum: ['unverified', 'pending', 'verified', 'rejected'], default: 'unverified' },
    idDocumentUrl: { type: String, default: null },
    idType: { type: String, default: 'Aadhaar' },
    idNumber: { type: String, default: null },
    idCardFront: { type: String, default: null },
    idCardBack: { type: String, default: null },
    rejectionReason: { type: String, default: null },
    
    // ✅ Account Deletion Request
    deleteRequested: { type: Boolean, default: false },
    
    // ✅ Wallet System
    walletBalance: { type: Number, default: 0 },
    
    // ✅ Saved Bank Details
    bankDetails: {
        bankName: { type: String, default: null },
        accountName: { type: String, default: null },
        accountNumber: { type: String, default: null },
        ifsc: { type: String, default: null },
        bankDocumentUrl: { type: String, default: null },
    },
    
    addresses: [{
        label: String, // e.g., "Home", "Work"
        address: String, // e.g., "123 Main St, Visakhapatnam"
        latitude: Number,
        longitude: Number,
        icon: { type: String, default: 'location' }
    }]
}, { timestamps: true });

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);