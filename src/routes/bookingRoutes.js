const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/authMiddleware');
const {
    getHostReservations,
    getAllHostBookings,
    getMyTrips,
    getBookingById,
    cancelBooking,
    updateBooking,
    createBooking,
    searchGuest,
    checkInBooking,
    checkOutBooking
} = require('../controllers/bookingController');

// 1. GET: Fetch Active and Upcoming Reservations for the Host
router.get('/host/today', requireAuth, getHostReservations);

// Fetch All Host Bookings & Reports (Daily, Monthly, All Time)
router.get('/host/all-bookings', requireAuth, getAllHostBookings);

// Search Guest details
router.get('/search-guest', requireAuth, searchGuest);

// 2. GET: Fetch Trips for the logged-in Guest
router.get('/my-trips', requireAuth, getMyTrips);

// 3. GET: Single booking by ID
router.get('/:id', requireAuth, getBookingById);

// 4. POST: Check-in / Check-out actions
router.post('/:id/check-in', requireAuth, checkInBooking);
router.post('/:id/check-out', requireAuth, checkOutBooking);

// 5. POST: Cancellation (Handles Calendar Cleanup + Chat Update + Notifications)
router.post('/:id/cancel', requireAuth, cancelBooking);

// 6. PATCH: Update Booking Data
router.patch('/:id', requireAuth, updateBooking);

// 7. POST: Create a new booking (ATOMIC TRANSACTION + NOTIFICATIONS)
router.post('/', requireAuth, createBooking);

module.exports = router;