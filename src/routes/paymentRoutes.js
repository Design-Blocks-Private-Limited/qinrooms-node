const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/authMiddleware');
const { createOrder, verifyPayment, verifyAndBook } = require('../controllers/paymentController');

// We use requireAuth to ensure only logged-in users can initiate payments
router.post('/create-order', requireAuth, createOrder);
router.post('/verify-payment', requireAuth, verifyPayment);
router.post('/verify-and-book', requireAuth, verifyAndBook);

module.exports = router;
