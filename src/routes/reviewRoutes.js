const express = require('express');
const router = express.Router();
const Review = require('../models/Review');
const Listing = require('../models/Listing');
const { requireAuth } = require('../middlewares/authMiddleware');

// 🛠️ HELPER FUNCTION: Recalculate listing rating when reviews change
const updateListingRating = async (listingId) => {
    const allListingReviews = await Review.find({ listingId });
    const reviewCount = allListingReviews.length;
    
    let averageRating = 0;
    if (reviewCount > 0) {
        const totalRatingScore = allListingReviews.reduce((sum, rev) => sum + rev.rating, 0);
        averageRating = (totalRatingScore / reviewCount).toFixed(1);
    }

    await Listing.findByIdAndUpdate(listingId, {
        averageRating: parseFloat(averageRating),
        reviewCount: reviewCount
    });
};

// 1. GET ALL REVIEWS FOR A SPECIFIC LISTING (Public Route)
router.get('/listing/:listingId', async (req, res) => {
    try {
        const reviews = await Review.find({ listingId: req.params.listingId })
                                    .sort({ createdAt: -1 }); // Newest first
        res.json(reviews);
    } catch (error) {
        console.error("Error fetching reviews:", error);
        res.status(500).json({ error: 'Server error fetching reviews' });
    }
});

// 2. CREATE A NEW REVIEW AS A GUEST (Protected Route)
router.post('/', requireAuth, async (req, res) => {
    try {
        const { listingId, rating, comment, reviewerName, reviewerImage } = req.body;
        const reviewerId = req.user.uid;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'Please provide a valid rating between 1 and 5.' });
        }
        if (!comment || comment.trim().length === 0) {
            return res.status(400).json({ error: 'Please write a comment for your review.' });
        }

        const newReview = new Review({
            listingId,
            reviewerId,
            reviewerName: reviewerName || req.user.name || "Guest",
            reviewerImage: reviewerImage || "https://via.placeholder.com/150",
            rating,
            comment
        });

        await newReview.save();
        
        // Update math
        await updateListingRating(listingId);

        res.status(201).json({ message: "Review posted successfully!", review: newReview });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ error: "You have already reviewed this listing." });
        }
        console.error("Error posting review:", error);
        res.status(500).json({ error: 'Failed to post review' });
    }
});

// 3. HOST REPLY TO A REVIEW (Protected Route)
router.patch('/:reviewId/reply', requireAuth, async (req, res) => {
    try {
        const { reply } = req.body;
        const hostId = req.user.uid;

        if (!reply || reply.trim().length === 0) {
            return res.status(400).json({ error: 'Reply text cannot be empty.' });
        }

        const review = await Review.findById(req.params.reviewId);
        if (!review) return res.status(404).json({ error: 'Review not found.' });

        const listing = await Listing.findById(review.listingId);
        if (!listing) return res.status(404).json({ error: 'Listing not found.' });

        if (listing.hostId !== hostId) {
            return res.status(403).json({ error: 'Unauthorized: Only the host can reply.' });
        }

        review.hostReply = reply;
        review.hostReplyDate = new Date();
        await review.save();

        res.json({ message: "Reply posted successfully!", review });

    } catch (error) {
        console.error("Error posting host reply:", error);
        res.status(500).json({ error: 'Failed to post reply' });
    }
});

// 4. UPDATE/EDIT A REVIEW AS A GUEST (Protected Route)
router.patch('/:id', requireAuth, async (req, res) => {
    try {
        const { rating, comment } = req.body;
        
        if (rating && (rating < 1 || rating > 5)) {
            return res.status(400).json({ error: 'Please provide a valid rating between 1 and 5.' });
        }

        const review = await Review.findOneAndUpdate(
            { _id: req.params.id, reviewerId: req.user.uid }, 
            { rating, comment }, 
            { new: true }
        );
        
        if (!review) return res.status(404).json({ error: 'Review not found or unauthorized' });

        // Update math if rating changed
        await updateListingRating(review.listingId);

        res.json(review);
    } catch (error) { 
        console.error("Error updating review:", error);
        res.status(500).json({ error: 'Failed to update review' }); 
    }
});

// 5. DELETE A REVIEW AS A GUEST (Protected Route)
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const review = await Review.findOneAndDelete({ _id: req.params.id, reviewerId: req.user.uid });
        
        if (!review) return res.status(404).json({ error: 'Review not found or unauthorized' });

        // Update math because a review was removed
        await updateListingRating(review.listingId);

        res.json({ message: 'Review deleted successfully' });
    } catch (error) { 
        console.error("Error deleting review:", error);
        res.status(500).json({ error: 'Failed to delete review' }); 
    }
});

module.exports = router;