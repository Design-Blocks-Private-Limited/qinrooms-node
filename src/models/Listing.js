const mongoose = require('mongoose');

const ListingSchema = new mongoose.Schema({
    hostId: { type: String, required: true, index: true },
    hostName: { type: String },
    hostImage: { type: String },
    title: { type: String, required: true },
    description: { type: String },
    type: { type: String, enum: ['house', 'apartment', 'barn', 'hotel', 'dorm', 'pg'] },
    privacy: { type: String },
    price: { type: Number, required: true },
    location: { type: String },
    latitude: { type: Number },
    longitude: { type: Number },
    images: [{ type: String }],
    amenities: [{ type: String }],
    status: { type: String, default: 'unlisted' },
    
    // ✅ NEW: Explicitly define these so MongoDB saves them!
    guests: { type: Number, default: 4 },
    bedrooms: { type: Number, default: 1 },
    beds: { type: Number, default: 1 },
    bathrooms: { type: Number, default: 1 },
    
    checkInTime: { type: String, default: '09:00 AM' },
    checkOutTime: { type: String, default: '08:00 AM' },
    
    minNights: { type: Number, default: 1 },
    inventoryCount: { type: Number, default: 1 },
    availability: { type: Map, of: Object, default: {} },
    rooms: [{
        name: { type: String },
        guests: { type: Number },
        beds: { type: Number },
        bathrooms: { type: Number },
        kitchen: { type: Number, default: 0 },
        price: { type: Number }
    }],
    
    averageRating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    reviewsCount: { type: Number, default: 0 },
    city: { type: String }
    
}, { timestamps: true });

module.exports = mongoose.model('Listing', ListingSchema);