const Listing = require('../models/Listing');

// Get all active listings for the home feed
const getActiveListings = async (req, res) => {
    try {
        const { type } = req.query; // e.g., ?type=house
        const filter = { status: 'active' };
        if (type) filter.type = type;

        const listings = await Listing.find(filter).sort({ createdAt: -1 });
        res.json(listings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch listings' });
    }
};

// Create a new listing (Protected by Auth)
const createListing = async (req, res) => {
    try {
        let { latitude, longitude, location, city } = req.body;
        
        // Auto-geocode if address is provided but coords are missing
        if (location && (!latitude || !longitude)) {
            try {
                // Try full address first
                let response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`, {
                    headers: { 'User-Agent': 'RentalApp/1.0' }
                });
                let data = await response.json();
                
                if (data && data.length > 0) {
                    latitude = parseFloat(data[0].lat);
                    longitude = parseFloat(data[0].lon);
                } else if (city) {
                    // Fallback to city name if full address is too specific (like Bangladeshi Colony...)
                    response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}`, {
                        headers: { 'User-Agent': 'RentalApp/1.0' }
                    });
                    data = await response.json();
                    if (data && data.length > 0) {
                        latitude = parseFloat(data[0].lat);
                        longitude = parseFloat(data[0].lon);
                    }
                }
            } catch (err) {
                console.error("Geocoding failed:", err);
                // Non-fatal, just continue without coords
            }
        }

        const newListing = new Listing({
            ...req.body,
            latitude: latitude || req.body.latitude,
            longitude: longitude || req.body.longitude,
            hostId: req.user.uid, // Forced securely by middleware
        });
        
        await newListing.save();
        res.status(201).json(newListing);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create listing' });
    }
};

module.exports = { getActiveListings, createListing };