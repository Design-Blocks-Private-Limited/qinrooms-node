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
        const newListing = new Listing({
            ...req.body,
            hostId: req.user.uid, // Forced securely by middleware
        });
        
        await newListing.save();
        res.status(201).json(newListing);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create listing' });
    }
};

module.exports = { getActiveListings, createListing };