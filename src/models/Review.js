const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    listingId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Listing', 
        required: true 
    },
    reviewerId: { 
        type: String, // Firebase UID of the guest
        required: true 
    },
    reviewerName: { 
        type: String, 
        required: true 
    },
    reviewerImage: { 
        type: String,
        default: 'https://via.placeholder.com/150'
    },
    rating: { 
        type: Number, 
        required: true,
        min: 1,
        max: 5
    },
    comment: { 
        type: String, 
        required: true,
        trim: true,
        maxlength: 1000 
    },
    // ✅ NEW: Fields for the Host to reply!
    hostReply: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: null
    },
    hostReplyDate: {
        type: Date,
        default: null
    }
}, { timestamps: true });

// Prevent a user from leaving multiple reviews on the same listing
reviewSchema.index({ listingId: 1, reviewerId: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);