const Review = require('../models/Review');
const Listing = require('../models/Listing');
const { sendNotification } = require('../utils/notificationUtils');
const { getPaginationParams, formatPaginatedResponse } = require('../utils/pagination');

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

// 1. GET ALL REVIEWS FOR A SPECIFIC LISTING
const getReviewsByListing = async (req, res) => {
    try {
        const { page, limit, skip } = getPaginationParams(req.query);
        const filter = { listingId: req.params.listingId };

        const total = await Review.countDocuments(filter);
        const reviews = await Review.find(filter)
                                    .sort({ createdAt: -1 }) // Newest first
                                    .skip(skip)
                                    .limit(limit);

        res.json(formatPaginatedResponse(reviews, total, page, limit));
    } catch (error) {
        console.error("Error fetching reviews:", error);
        res.status(500).json({ error: 'Server error fetching reviews' });
    }
};

// 2. CREATE A NEW REVIEW AS A GUEST
const createReview = async (req, res) => {
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

        // ✅ SEND NOTIFICATION TO HOST
        try {
            const listing = await Listing.findById(listingId);
            if (listing && listing.hostId) {
                await sendNotification({
                    userId: listing.hostId,
                    title: "New Review! ⭐",
                    body: `${newReview.reviewerName} left a ${rating}-star review on your property.`,
                    type: "review",
                    relatedId: listingId
                });
            }
        } catch (notifErr) {
            console.error("Failed to notify host about review:", notifErr);
        }

        res.status(201).json({ message: "Review posted successfully!", review: newReview });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ error: "You have already reviewed this listing." });
        }
        console.error("Error posting review:", error);
        res.status(500).json({ error: 'Failed to post review' });
    }
};

// 3. HOST CREATE/EDIT REPLY TO A REVIEW
const replyToReview = async (req, res) => {
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

        // ✅ SEND NOTIFICATION TO GUEST
        try {
            await sendNotification({
                userId: review.reviewerId,
                title: "Host replied to your review 📝",
                body: `The host of ${listing.title || 'a property'} responded to your review.`,
                type: "review",
                relatedId: listing._id.toString()
            });
        } catch (notifErr) {
            console.error("Failed to notify guest about reply:", notifErr);
        }

        res.json({ message: "Reply posted successfully!", review });

    } catch (error) {
        console.error("Error posting host reply:", error);
        res.status(500).json({ error: 'Failed to post reply' });
    }
};

// 4. UPDATE/EDIT A REVIEW AS A GUEST
const updateReview = async (req, res) => {
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
};

// 5. DELETE A REVIEW AS A GUEST
const deleteReview = async (req, res) => {
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
};

// 6. DELETE A HOST REPLY
const deleteReply = async (req, res) => {
    try {
        const hostId = req.user.uid;
        
        const review = await Review.findById(req.params.reviewId);
        if (!review) return res.status(404).json({ error: 'Review not found.' });

        const listing = await Listing.findById(review.listingId);
        if (!listing || listing.hostId !== hostId) {
            return res.status(403).json({ error: 'Unauthorized: Only the host can delete this reply.' });
        }

        // Clear the host reply fields
        review.hostReply = null;
        review.hostReplyDate = null;
        await review.save();

        res.json({ message: "Host reply deleted successfully." });
    } catch (error) {
        console.error("Error deleting host reply:", error);
        res.status(500).json({ error: 'Failed to delete reply' });
    }
};

module.exports = {
    getReviewsByListing,
    createReview,
    replyToReview,
    updateReview,
    deleteReview,
    deleteReply
};