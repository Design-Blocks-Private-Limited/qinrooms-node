const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Listing = require('../models/Listing');
const Booking = require('../models/Booking');

// ✅ 1. IMPORT FIREBASE ADMIN SDK (Required to delete the auth account)
const admin = require('../config/firebase'); 

// Require BOTH middlewares to ensure they are logged in AND are an admin
const { requireAuth, requireAdmin } = require('../middlewares/authMiddleware'); 

// Apply middlewares to all routes in this file
router.use(requireAuth);
router.use(requireAdmin);

// 1. GET ALL USERS (Guests, Hosts, Admins)
router.get('/users', async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// 2. GET ALL LISTINGS (Hotels, Dorms, Houses)
router.get('/listings', async (req, res) => {
    try {
        const listings = await Listing.find().sort({ createdAt: -1 });
        res.json(listings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch listings' });
    }
});

// ✅ 2.5 ADDED THIS MISSING ROUTE: DELETE LISTING
router.delete('/listings/:id', async (req, res) => {
    try {
        const deletedListing = await Listing.findByIdAndDelete(req.params.id);
        
        if (!deletedListing) {
            return res.status(404).json({ error: 'Listing not found in database' });
        }

        res.json({ success: true, message: 'Property permanently deleted.' });
    } catch (error) {
        console.error("Admin Delete Listing Error:", error);
        res.status(500).json({ error: 'Failed to delete listing from server' });
    }
});

// 3. GET ALL BOOKINGS
router.get('/bookings', async (req, res) => {
    try {
        const bookings = await Booking.find().sort({ createdAt: -1 });
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch bookings' });
    }
});

// ✅ 4. UPDATE USER (Edit Name & Phone)
router.patch('/users/:id', async (req, res) => {
    try {
        const { name, phoneNumber } = req.body;
        
        // Update only the specific fields provided
        const updatedUser = await User.findByIdAndUpdate(
            req.params.id, 
            { $set: { name, phoneNumber } }, 
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found in database' });
        }

        res.json(updatedUser);
    } catch (error) {
        console.error("Admin Edit User Error:", error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// ✅ 5. DELETE USER (Wipe from Firebase, MongoDB, AND Delete their Listings)
router.delete('/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;

        // SAFEGUARD: Prevent admin from deleting themselves
        if (req.user.uid === userId) {
            return res.status(403).json({ error: "Action Denied: You cannot delete your own Master Admin account." });
        }

        // Step 1: Delete from Firebase Authentication
        try {
            await admin.auth().deleteUser(userId);
            console.log(`Successfully deleted user ${userId} from Firebase Auth`);
        } catch (firebaseError) {
            if (firebaseError.code === 'auth/user-not-found') {
                console.log(`User ${userId} not found in Firebase Auth, proceeding to DB cleanup.`);
            } else {
                throw firebaseError; 
            }
        }

        // Step 2: Delete all Listings hosted by this user (Cascading Delete)
        const deletedListings = await Listing.deleteMany({ hostId: userId });
        console.log(`Deleted ${deletedListings.deletedCount} listings belonging to user ${userId}`);

        // Step 3: Delete the User from MongoDB
        const deletedUser = await User.findByIdAndDelete(userId);
        
        if (!deletedUser) {
            return res.status(404).json({ error: 'User not found in MongoDB' });
        }

        res.json({ 
            success: true, 
            message: `User and their ${deletedListings.deletedCount} listings completely wiped from system.` 
        });
    } catch (error) {
        console.error("Admin Delete User Error:", error);
        res.status(500).json({ error: 'Failed to completely delete user and their data' });
    }
});

// ✅ 6. CREATE NEW ADMIN USER
router.post('/create-admin', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required.' });
        }

        // 1. Create the user securely in Firebase Authentication
        const firebaseUser = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: name,
        });

        // 2. Save the user in MongoDB using the Firebase UID, flagging them as an Admin
        const newAdmin = new User({
            _id: firebaseUser.uid,
            name: name,
            email: email,
            isAdmin: true,
            isHost: false, 
            phoneNumber: '' 
        });

        await newAdmin.save();

        res.status(201).json({ success: true, user: newAdmin });
    } catch (error) {
        console.error("Create Admin Error:", error);
        res.status(400).json({ error: error.message || 'Failed to create admin user' });
    }
});

// ✅ 7. UPDATE BOOKING (Force Check-In, Cancel, etc.)
router.patch('/bookings/:id', async (req, res) => {
    try {
        // Automatically applies whatever the frontend sends (e.g. { checkInConfirmed: true } or { status: 'cancelled' })
        const updatedBooking = await Booking.findByIdAndUpdate(
            req.params.id, 
            { $set: req.body }, 
            { new: true }
        );

        if (!updatedBooking) {
            return res.status(404).json({ error: 'Booking not found in database' });
        }

        res.json(updatedBooking);
    } catch (error) {
        console.error("Admin Update Booking Error:", error);
        res.status(500).json({ error: 'Failed to update booking' });
    }
});

// ✅ 8. DELETE BOOKING (Completely wipe record from database)
router.delete('/bookings/:id', async (req, res) => {
    try {
        const deletedBooking = await Booking.findByIdAndDelete(req.params.id);
        
        if (!deletedBooking) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        res.json({ success: true, message: 'Booking permanently deleted.' });
    } catch (error) {
        console.error("Admin Delete Booking Error:", error);
        res.status(500).json({ error: 'Failed to delete booking' });
    }
});

module.exports = router;