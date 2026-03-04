const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
    // IDs (Firebase UIDs for Users, MongoDB IDs for Listings)
    bookerId: { type: String, required: true },
    hostId: { type: String, required: true },
    listingId: { type: String, required: true },

    // Listing Details (For quick display in "My Trips")
    title: { type: String, required: true },
    image: { type: String },
    location: { type: String },
    type: { type: String }, // 'house', 'hotel', etc.

    // Guest Info
    bookerName: { type: String, required: true },
    bookerEmail: { type: String }, // Good practice to include

    // Booking Details
    status: { type: String, default: 'upcoming' }, // 'upcoming', 'active', 'completed', 'cancelled'
    checkInDate: { type: Date, required: true },
    checkOutDate: { type: Date, required: true },
    totalPrice: { type: Number, required: true },
    
    // Breakdowns (Optional but matches your frontend code)
    priceBreakdown: {
        nights: Number,
        basePrice: Number,
        serviceFee: Number,
        taxes: Number
    },

    // Check-in tracking & OTP
    checkInOtp: { type: String, required: true }, 
    checkInConfirmed: { type: Boolean, default: false },
    checkedInAt: { type: Date }
    
}, { 
    strict: false, // Useful for legacy/migrated data compatibility
    timestamps: true 
});

module.exports = mongoose.model('Booking', BookingSchema);