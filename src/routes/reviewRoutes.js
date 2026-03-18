const express = require('express');
const router = express.Router();
const Review = require('../models/Review');
const Listing = require('../models/Listing');
const { requireAuth } = require('../middlewares/authMiddleware');

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

        // 1. Validate Input
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'Please provide a valid rating between 1 and 5.' });
        }
        if (!comment || comment.trim().length === 0) {
            return res.status(400).json({ error: 'Please write a comment for your review.' });
        }

        // 2. Create and Save the Review
        const newReview = new Review({
            listingId,
            reviewerId,
            reviewerName: reviewerName || req.user.name || "Guest",
            reviewerImage: reviewerImage || "https://via.placeholder.com/150",
            rating,
            comment
        });

        await newReview.save();

        // 3. SMART CALCULATION: Update the Listing's Average Rating
        const allListingReviews = await Review.find({ listingId });
        
        const totalRatingScore = allListingReviews.reduce((sum, rev) => sum + rev.rating, 0);
        const reviewCount = allListingReviews.length;
        
        // Calculate average to 1 decimal place (e.g., 4.7)
        const averageRating = (totalRatingScore / reviewCount).toFixed(1);

        // Update the Listing document
        await Listing.findByIdAndUpdate(listingId, {
            averageRating: parseFloat(averageRating),
            reviewCount: reviewCount
        });

        res.status(201).json({ message: "Review posted successfully!", review: newReview });

    } catch (error) {
        // Catch the unique index error if they try to review twice
        if (error.code === 11000) {
            return res.status(400).json({ error: "You have already reviewed this listing." });
        }
        console.error("Error posting review:", error);
        res.status(500).json({ error: 'Failed to post review' });
    }
});

// ✅ 3. HOST REPLY TO A REVIEW (Protected Route)
router.patch('/:reviewId/reply', requireAuth, async (req, res) => {
    try {
        const { reply } = req.body;
        const hostId = req.user.uid;

        if (!reply || reply.trim().length === 0) {
            return res.status(400).json({ error: 'Reply text cannot be empty.' });
        }

        // 1. Find the specific review
        const review = await Review.findById(req.params.reviewId);
        if (!review) {
            return res.status(404).json({ error: 'Review not found.' });
        }

        // 2. Find the listing to verify ownership
        const listing = await Listing.findById(review.listingId);
        if (!listing) {
            return res.status(404).json({ error: 'Listing associated with this review not found.' });
        }

        // 3. SECURITY CHECK: Ensure the logged-in user is the actual host of this listing
        if (listing.hostId !== hostId) {
            return res.status(403).json({ error: 'Unauthorized: Only the host of this property can reply.' });
        }

        // 4. Update the review with the host's reply
        review.hostReply = reply;
        review.hostReplyDate = new Date();
        
        await review.save();

        res.json({ message: "Reply posted successfully!", review });

    } catch (error) {
        console.error("Error posting host reply:", error);
        res.status(500).json({ error: 'Failed to post reply' });
    }
});

module.exports = router;