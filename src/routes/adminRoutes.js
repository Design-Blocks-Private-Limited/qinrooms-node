const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Listing = require('../models/Listing');
const Booking = require('../models/Booking');
const SupportTicket = require('../models/SupportTicket');

const { getPricing, updatePricing } = require('../controllers/pricingController');

const bcrypt = require('bcryptjs');

// Require BOTH middlewares to ensure they are logged in AND are an admin
const { requireAuth, requireAdmin } = require('../middlewares/authMiddleware'); 

// Apply middlewares to all routes in this file
router.use(requireAuth);
router.use(requireAdmin);

// 1. GET ALL USERS (Guests, Hosts, Admins)
router.get('/users', async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 }).lean();
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

// ✅ 3.5 PROCESS REFUND
const { processRefund } = require('../controllers/paymentController');

router.post('/bookings/:id/refund', async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ error: 'Booking not found' });
        
        if (booking.status !== 'pending_refund') {
            return res.status(400).json({ error: 'Booking is not pending a refund' });
        }
        
        if (!booking.razorpay_payment_id) {
            return res.status(400).json({ error: 'No Razorpay payment ID found for this booking' });
        }
        
        // Process refund via Razorpay (using total price for now)
        // Subtract platform fee if applicable in future
        const refundResponse = await processRefund(booking.razorpay_payment_id, booking.totalPrice);
        
        // Update booking status
        booking.status = 'refunded';
        booking.razorpay_refund_id = refundResponse.id;
        await booking.save();
        
        res.json({ success: true, message: 'Refund processed successfully', booking });
    } catch (error) {
        console.error("Admin Refund Error:", error);
        res.status(500).json({ error: error.description || 'Failed to process refund with Razorpay' });
    }
});

// ✅ 3.6 APPROVE/REJECT HOST VERIFICATION
router.post('/users/:id/verify', async (req, res) => {
    try {
        const { status } = req.body; // 'verified' or 'rejected'
        if (!['verified', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { $set: { verificationStatus: status } },
            { new: true }
        );

        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, user });
    } catch (error) {
        console.error("Admin Verify Error:", error);
        res.status(500).json({ error: 'Failed to verify host' });
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

// ✅ 5. DELETE USER (Wipe from MongoDB, AND Delete their Listings)
router.delete('/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;

        // SAFEGUARD: Prevent admin from deleting themselves
        if (req.user.uid === userId) {
            return res.status(403).json({ error: "Action Denied: You cannot delete your own Master Admin account." });
        }

        // Step 1: Delete all Listings hosted by this user (Cascading Delete)
        const deletedListings = await Listing.deleteMany({ hostId: userId });
        console.log(`Deleted ${deletedListings.deletedCount} listings belonging to user ${userId}`);

        // Step 2: Delete the User from MongoDB
        let queryUserId = userId;
        if (require('mongoose').Types.ObjectId.isValid(queryUserId) && typeof queryUserId === 'string' && queryUserId.length === 24) {
            queryUserId = new (require('mongoose').Types.ObjectId)(queryUserId);
        }
        const deletedUser = await require('mongoose').connection.collection('users').findOneAndDelete({ _id: queryUserId });
        
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

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'A user with this email already exists.' });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Save the user in MongoDB flagging them as an Admin
        const newAdmin = new User({
            name: name,
            email: email,
            password: hashedPassword,
            isAdmin: true,
            isHost: false, 
            phoneNumber: `admin-${email}` // unique placeholder for admin since phone is required in schema
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

router.put('/pricing', updatePricing);

router.get('/support-tickets', async (req, res) => {
    try {
        const tickets = await SupportTicket.find().sort({ updatedAt: -1 }).lean(); // Use lean() to allow modification
        
        // Populate missing emails and phones for legacy tickets
        for (let ticket of tickets) {
            if (!ticket.userEmail || !ticket.userPhone) {
                try {
                    const user = await User.findById(ticket.userId);
                    if (user) {
                        ticket.userEmail = ticket.userEmail || user.email;
                        ticket.userPhone = ticket.userPhone || user.phoneNumber;
                    }
                } catch (err) {
                    console.error("Failed to fetch user for ticket", ticket._id, err);
                }
            }
        }
        res.json(tickets);
    } catch (error) {
        console.error("Failed to fetch tickets:", error);
        res.status(500).json({ error: 'Failed to fetch tickets' });
    }
});

// 2. ADMIN REPLIES TO A TICKET
router.post('/support-tickets/:ticketId/message', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || !text.trim()) return res.status(400).json({ error: 'Message empty' });

        const ticket = await SupportTicket.findById(req.params.ticketId);
        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

        ticket.messages.push({
            sender: 'admin',
            text: text.trim()
        });
        
        // Re-open the ticket if the admin replies to a resolved one
        if (ticket.status === 'resolved') ticket.status = 'open';

        await ticket.save();

        // Broadcast the new message via Socket.io
        try {
            const io = req.app.get('io');
            const roomName = `support_${ticket._id}`;
            const savedMsg = ticket.messages[ticket.messages.length - 1];
            io.to(roomName).emit('receive_support_message', { ticketId: ticket._id, message: savedMsg });

            // Also broadcast to the support_admins room
            io.to('support_admins').emit('receive_support_message', { ticketId: ticket._id, message: savedMsg });
        } catch (socketError) {
            console.error("Failed to broadcast admin support message:", socketError);
        }

        res.json(ticket);
    } catch (error) {
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// 3. MARK TICKET AS RESOLVED
router.patch('/support-tickets/:ticketId/resolve', async (req, res) => {
    try {
        const ticket = await SupportTicket.findByIdAndUpdate(
            req.params.ticketId, 
            { status: 'resolved' }, 
            { new: true }
        );

        // Broadcast ticket resolution via Socket.io
        try {
            const io = req.app.get('io');
            const roomName = `support_${ticket._id}`;
            io.to(roomName).emit('support_ticket_resolved', { ticketId: ticket._id });

            // Also broadcast to the support_admins room
            io.to('support_admins').emit('support_ticket_resolved', { ticketId: ticket._id });
        } catch (socketError) {
            console.error("Failed to broadcast support ticket resolution:", socketError);
        }

        res.json(ticket);
    } catch (error) {
        res.status(500).json({ error: 'Failed to resolve ticket' });
    }
});

module.exports = router;