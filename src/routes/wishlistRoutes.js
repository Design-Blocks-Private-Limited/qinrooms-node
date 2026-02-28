const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { requireAuth } = require('../middlewares/authMiddleware');

// Define a simple Schema directly here since it doesn't need much logic
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

// POST: Create a new wishlist folder
router.post('/', requireAuth, async (req, res) => {
    try {
        const { name, item } = req.body;
        
        const newWishlist = new Wishlist({
            userId: req.user.uid,
            name: name,
            items: item ? [item] : [] // Add item immediately if provided
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
            { $addToSet: { items: item } }, // Prevents duplicates if listingId matches
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
            { $pull: { items: { listingId: listingId } } }, // Replaces arrayRemove
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