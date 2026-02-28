const express = require('express');
const router = express.Router();
const Listing = require('../models/Listing'); 
const { requireAuth } = require('../middlewares/authMiddleware');

// GET /api/listings?type=house
router.get('/', async (req, res) => {
    try {
        const { type } = req.query;
        const filter = { status: 'active' };
        if (type) filter.type = type;

        // Fetch listings, sort by newest
        const listings = await Listing.find(filter).sort({ createdAt: -1 });
        
        // MongoDB returns `_id`. React Native expects `id`. Let's map it safely.
        const formattedListings = listings.map(l => ({ id: l._id, ...l._doc }));
        
        res.json(formattedListings);
    } catch (error) {
        res.status(500).json({ error: 'Server error fetching listings' });
    }
});

// ✅ MOVED ABOVE /:id 
// GET all listings for the logged-in Host
router.get('/my-host-listings', requireAuth, async (req, res) => {
    try {
        // Fetch all listings where the hostId matches the authenticated user
        const listings = await Listing.find({ hostId: req.user.uid }).sort({ createdAt: -1 });
        const formattedListings = listings.map(l => ({ id: l._id, ...l._doc }));
        res.json(formattedListings);
    } catch (error) {
        console.error("Fetch host listings error:", error);
        res.status(500).json({ error: 'Failed to fetch your listings' });
    }
});

// GET a single listing by ID (Now safely handling Firebase IDs)
router.get('/:id', async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id);
        if (!listing) return res.status(404).json({ error: 'Listing not found' });
        
        res.json({ id: listing._id, ...listing._doc });
    } catch (error) {
        // ✅ CATCH MONGOOSE CAST ERRORS (Invalid ID formats)
        if (error.name === 'CastError') {
            return res.status(404).json({ error: 'Listing not found (Invalid ID format)' });
        }
        console.error("Single Listing Error:", error.message);
        res.status(500).json({ error: 'Server error fetching listing' });
    }
});

// POST a new listing
router.post('/', requireAuth, async (req, res) => {
    try {
        const listingData = req.body;
        
        // Ensure the hostId is securely attached based on the token, not the frontend body
        const newListing = new Listing({
            ...listingData,
            hostId: req.user.uid, 
            createdAt: new Date()
        });

        await newListing.save();
        res.status(201).json({ id: newListing._id, ...newListing._doc });
    } catch (error) {
        console.error("Create listing error:", error);
        res.status(500).json({ error: 'Failed to create listing' });
    }
});

// PATCH: Update specific fields of a listing
router.patch('/:id', requireAuth, async (req, res) => {
    try {
        // Ensure the listing belongs to the logged-in host before allowing updates
        const listing = await Listing.findOneAndUpdate(
            { _id: req.params.id, hostId: req.user.uid },
            { $set: req.body }, // Only updates the fields provided in the payload
            { new: true }
        );

        if (!listing) {
            return res.status(404).json({ error: 'Listing not found or unauthorized' });
        }

        res.json({ id: listing._id, ...listing._doc });
    } catch (error) {
        console.error("Update listing error:", error);
        res.status(500).json({ error: 'Failed to update listing' });
    }
});

// DELETE a listing
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const listing = await Listing.findOneAndDelete({ _id: req.params.id, hostId: req.user.uid });
        if (!listing) {
            return res.status(404).json({ error: 'Listing not found or unauthorized' });
        }
        res.json({ message: 'Listing deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete listing' });
    }
});

module.exports = router;