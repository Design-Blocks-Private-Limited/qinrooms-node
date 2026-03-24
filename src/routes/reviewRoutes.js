const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/authMiddleware');
const { 
    getReviewsByListing, 
    createReview, 
    replyToReview, 
    updateReview, 
    deleteReview, 
    deleteReply 
} = require('../controllers/reviewController');

// 1. GET ALL REVIEWS FOR A SPECIFIC LISTING (Public Route)
router.get('/listing/:listingId', getReviewsByListing);

// 2. CREATE A NEW REVIEW AS A GUEST (Protected Route)
router.post('/', requireAuth, createReview);

// 3. HOST CREATE/EDIT REPLY TO A REVIEW (Protected Route)
router.patch('/:reviewId/reply', requireAuth, replyToReview);

// 4. UPDATE/EDIT A REVIEW AS A GUEST (Protected Route)
router.patch('/:id', requireAuth, updateReview);

// 5. DELETE A REVIEW AS A GUEST (Protected Route)
router.delete('/:id', requireAuth, deleteReview);

// 6. DELETE A HOST REPLY (Protected Route)
router.delete('/:reviewId/reply', requireAuth, deleteReply);

module.exports = router;