const express = require('express');
const router = express.Router();
const Listing = require('../models/Listing'); 
const User = require('../models/User'); // ✅ 1. ADDED: Need this to check if user is Admin
const { requireAuth } = require('../middlewares/authMiddleware');
const { getPricing } = require('../controllers/pricingController');

// GET /api/listings/status/bulk?ids=1,2,3
router.get('/status/bulk', requireAuth, async (req, res) => {
    try {
        const { ids } = req.query;
        if (!ids) {
            return res.json({ statusMap: {} });
        }
        const idArray = ids.split(',');
        const listings = await Listing.find({ _id: { $in: idArray } }, 'status').lean();
        
        const statusMap = {};
        listings.forEach(listing => {
            statusMap[listing._id.toString()] = listing.status;
        });

        res.json({ statusMap });
    } catch (error) {

        res.status(500).json({ message: "Failed to fetch status" });
    }
});

// GET /api/listings?type=House,Apartment,Barn
router.get('/', async (req, res) => {
    try {
        const { type, page = 1, limit = 20 } = req.query;
        
        // Find all verified hosts and use .lean() to bypass Mongoose casting 
        // (since Firebase UIDs are Strings but Mongoose defaults _id to ObjectId)
        const verifiedUsers = await User.find({ verificationStatus: 'verified' }, '_id').lean();
        const verifiedUserIds = verifiedUsers.map(u => u._id.toString());

        const filter = { 
            status: 'active',
            hostId: { $in: verifiedUserIds }
        };
        
        // ✅ UPDATED: Split the comma-separated string into an array for MongoDB
        if (type) {
            // Handle cases where `type` might be parsed as an array by Express
            const typeStr = Array.isArray(type) ? type.join(',') : type;
            const typesArray = typeStr.split(','); 
            
            // Enum values in Mongoose are lowercase strings ('house', 'apartment', etc.)
            // We cannot use RegExp with $in for Enums in Mongoose, it throws a CastError.
            const lowerCaseArray = typesArray.map(t => t.trim().toLowerCase());
            
            filter.type = { $in: lowerCaseArray };
        }

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        // Fetch listings, sort by newest, apply pagination
        const listings = await Listing.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum);
        
        // MongoDB returns `_id`. React Native expects `id`. Let's map it safely.
        const formattedListings = listings.map(l => ({ id: l._id, ...l._doc }));
        
        res.json(formattedListings);
    } catch (error) {

        res.status(500).json({ error: 'Server error fetching listings' });
    }
});

// GET all listings for the logged-in Host
router.get('/my-host-listings', requireAuth, async (req, res) => {
    try {
        const query = { hostId: req.user.uid };
        if (req.query.type) {
            query.type = req.query.type;
        }

        const listings = await Listing.find(query).sort({ createdAt: -1 });
        const formattedListings = listings.map(l => ({ id: l._id, ...l._doc }));
        res.json(formattedListings);
    } catch (error) {

        res.status(500).json({ error: 'Failed to fetch your listings' });
    }
});

router.get('/pricing', getPricing);

// GET a single listing by ID (Now safely handling Firebase IDs)
router.get('/:id', async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id);
        if (!listing) return res.status(404).json({ error: 'Listing not found' });
        
        res.json({ id: listing._id, ...listing._doc });
    } catch (error) {
        // CATCH MONGOOSE CAST ERRORS (Invalid ID formats)
        if (error.name === 'CastError') {
            return res.status(404).json({ error: 'Listing not found (Invalid ID format)' });
        }

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

        res.status(500).json({ error: 'Failed to create listing' });
    }
});

// ✅ UPDATED PATCH: Update specific fields of a listing
router.patch('/:id', requireAuth, async (req, res) => {
    try {
        // 1. Check if the user making the request is an Admin
        const user = await User.findById(req.user.uid);
        const isAdmin = user && user.isAdmin;

        // 2. Build the query safely
        const query = { _id: req.params.id };
        if (!isAdmin) {
            // If they are NOT an Admin, enforce the lock
            query.hostId = req.user.uid; 
        }

        const listing = await Listing.findOneAndUpdate(
            query,
            { $set: req.body }, 
            { new: true }
        );

        if (!listing) {
            return res.status(404).json({ error: 'Listing not found or unauthorized' });
        }

        res.json({ id: listing._id, ...listing._doc });
    } catch (error) {

        res.status(500).json({ error: 'Failed to update listing' });
    }
});

// ✅ UPDATED DELETE a listing
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        // 1. Check if the user making the request is an Admin
        const user = await User.findById(req.user.uid);
        const isAdmin = user && user.isAdmin;

        // 2. Build the query safely
        const query = { _id: req.params.id };
        if (!isAdmin) {
            // If they are NOT an Admin, enforce the lock
            query.hostId = req.user.uid; 
        }

        const listing = await Listing.findOneAndDelete(query);
        
        if (!listing) {
            return res.status(404).json({ error: 'Listing not found or unauthorized' });
        }
        res.json({ message: 'Listing deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete listing' });
    }
});

module.exports = router;