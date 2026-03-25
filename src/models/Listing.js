const mongoose = require('mongoose');

const ListingSchema = new mongoose.Schema({
    hostId: { type: String, required: true, index: true }, // Links to Firebase UID
    hostName: { type: String },
    hostImage: { type: String },
    title: { type: String, required: true },
    description: { type: String },
    type: { type: String, enum: ['house', 'apartment', 'barn', 'hotel', 'dorm'] },
    privacy: { type: String },
    price: { type: Number, required: true },
    location: { type: String },
    latitude: { type: Number },
    longitude: { type: Number },
    images: [{ type: String }], // Array of Cloudinary URLs
    amenities: [{ type: String }],
    status: { type: String, default: 'action_required' },
    
    // ✅ NEW: Property Timings
    checkInTime: { type: String, default: '09:00 AM' },
    checkOutTime: { type: String, default: '08:00 AM' },
    
    // Availability embedded directly
    minNights: { type: Number, default: 1 },
    inventoryCount: { type: Number, default: 1 },
    availability: { type: Map, of: Object, default: {} },
    
    // Review System Fields
    averageRating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 }
    
}, { timestamps: true });

module.exports = mongoose.model('Listing', ListingSchema);