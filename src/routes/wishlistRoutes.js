const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { requireAuth } = require('../middlewares/authMiddleware');

const WishlistSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    name: { type: String, required: true },
    items: { type: Array, default: [] },
}, { timestamps: true });

const Wishlist = mongoose.models.Wishlist || mongoose.model('Wishlist', WishlistSchema);

// GET: Fetch all wishlists for the current user
router.get('/', requireAuth, async (req, res) => {
    try {
        const wishlists = await Wishlist.find({ userId: req.user.uid }).sort({ createdAt: -1 });
        const formatted = wishlists.map(w => ({ id: w._id, ...w._doc }));
        res.json(formatted);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch wishlists' });
    }
});

// ✅ NEW: SYNC GUEST WISHLISTS UPON LOGIN
router.post('/sync', requireAuth, async (req, res) => {
    try {
        const { guestWishlists } = req.body; // Expects an array: [{ name: "Favorites", items: [...] }]
        
        if (!guestWishlists || guestWishlists.length === 0) {
            return res.json({ success: true, message: "Nothing to sync" });
        }

        for (let gw of guestWishlists) {
            // Find if this user already has a wishlist with this name
            let existingList = await Wishlist.findOne({ userId: req.user.uid, name: gw.name });
            
            if (existingList) {
                // Merge items safely to avoid duplicates
                const newItems = gw.items.filter(gItem => 
                    !existingList.items.some(eItem => eItem.listingId === gItem.listingId)
                );
                
                if (newItems.length > 0) {
                    existingList.items.push(...newItems);
                    await existingList.save();
                }
            } else {
                // Create brand new wishlist folder from the guest data
                const newList = new Wishlist({
                    userId: req.user.uid,
                    name: gw.name,
                    items: gw.items
                });
                await newList.save();
            }
        }

        res.status(200).json({ success: true, message: "Wishlists synced successfully" });
    } catch (error) {

        res.status(500).json({ error: 'Failed to sync wishlists' });
    }
});

// POST: Create a new wishlist folder
router.post('/', requireAuth, async (req, res) => {
    try {
        const { name, item } = req.body;

        const existingList = await Wishlist.findOne({ userId: req.user.uid, name: name });
        if (existingList) {
            return res.status(400).json({ error: 'A wishlist with this name already exists' });
        }

        const newWishlist = new Wishlist({
            userId: req.user.uid,
            name: name,
            items: item ? [item] : [] 
        });
        await newWishlist.save();
        res.status(201).json({ id: newWishlist._id, ...newWishlist._doc });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create wishlist' });
    }
});

// PUT: Add an item to an existing folder
router.put('/:id/add', requireAuth, async (req, res) => {
    try {
        const { item } = req.body;
        const wishlist = await Wishlist.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.uid },
            { $addToSet: { items: item } }, 
            { new: true }
        );
        if (!wishlist) return res.status(404).json({ error: 'Wishlist not found' });
        res.json(wishlist);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add item' });
    }
});

// PUT: Remove an item from a folder
router.put('/:id/remove', requireAuth, async (req, res) => {
    try {
        const { listingId } = req.body;
        const wishlist = await Wishlist.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.uid },
            { $pull: { items: { listingId: listingId } } }, 
            { new: true }
        );
        if (!wishlist) return res.status(404).json({ error: 'Wishlist not found' });
        res.json(wishlist);
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove item' });
    }
});

// DELETE: Delete an entire folder
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const result = await Wishlist.findOneAndDelete({ _id: req.params.id, userId: req.user.uid });
        if (!result) return res.status(404).json({ error: 'Wishlist not found' });
        res.json({ success: true, message: 'Wishlist deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete wishlist' });
    }
});

module.exports = router;