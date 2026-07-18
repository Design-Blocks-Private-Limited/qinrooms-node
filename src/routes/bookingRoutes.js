const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/authMiddleware');
const {
    getHostReservations,
    getMyTrips,
    getBookingById,
    cancelBooking,
    updateBooking,
    createBooking,
    searchGuest
} = require('../controllers/bookingController');

// 1. GET: Fetch Active and Upcoming Reservations for the Host
router.get('/host/today', requireAuth, getHostReservations);

// Search Guest details
router.get('/search-guest', requireAuth, searchGuest);

// 2. GET: Fetch Trips for the logged-in Guest
router.get('/my-trips', requireAuth, getMyTrips);

// 3. GET: Single booking by ID
router.get('/:id', requireAuth, getBookingById);

// 4. POST: Cancellation (Handles Calendar Cleanup + Chat Update + Notifications)
router.post('/:id/cancel', requireAuth, cancelBooking);

// 5. PATCH: Update Booking Data
router.patch('/:id', requireAuth, updateBooking);

// 6. POST: Create a new booking (ATOMIC TRANSACTION + NOTIFICATIONS)
router.post('/', requireAuth, createBooking);

module.exports = router;