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
    
    // Availability embedded directly
    minNights: { type: Number, default: 1 },
    inventoryCount: { type: Number, default: 1 },
    availability: { type: Map, of: Object, default: {} } 
}, { timestamps: true });

module.exports = mongoose.model('Listing', ListingSchema);