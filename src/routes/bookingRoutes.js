const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { requireAuth } = require('../middlewares/authMiddleware');
const Listing = require('../models/Listing');
const Chat = require('../models/Chat');
const Booking = require('../models/Booking');

// --- HELPERS ---
const toDateId = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// --- ROUTES ---

// GET: Fetch Active and Upcoming Reservations for the Host
router.get('/host/today', requireAuth, async (req, res) => {
    try {
        const bookings = await Booking.find({
            hostId: req.user.uid,
            status: { $in: ['upcoming', 'active'] }
        }).sort({ checkInDate: 1 });

        const formatted = bookings.map(b => ({ id: b._id, ...b._doc }));
        res.json(formatted);
    } catch (error) {
        console.error("Failed to fetch reservations:", error);
        res.status(500).json({ error: 'Failed to fetch reservations' });
    }
});

// GET: Fetch Trips for the logged-in Guest
router.get('/my-trips', requireAuth, async (req, res) => {
    try {
        const bookings = await Booking.find({ bookerId: req.user.uid })
            .sort({ checkInDate: 1 });

        const formatted = bookings.map(b => ({ id: b._id, ...b._doc }));
        res.json(formatted);
    } catch (error) {
        console.error("Failed to fetch trips:", error);
        res.status(500).json({ error: 'Failed to fetch trips' });
    }
});

// ✅ ADDED: GET single booking by ID (Fixes the 404/JSON Parse Error)
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ error: 'Booking not found' });

        // Security: Only host or guest can see this
        if (booking.hostId !== req.user.uid && booking.bookerId !== req.user.uid) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        res.json({ id: booking._id, ...booking._doc });
    } catch (error) {
        res.status(500).json({ error: 'Error fetching booking' });
    }
});

// ✅ ADDED: POST Cancellation (Handles Calendar Cleanup + Chat Update)
router.post('/:id/cancel', requireAuth, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const booking = await Booking.findById(req.params.id).session(session);
        if (!booking) throw new Error("Booking not found");
        if (booking.bookerId !== req.user.uid) throw new Error("Unauthorized");

        // 1. Update Booking Status
        booking.status = 'cancelled';
        await booking.save({ session });

        // 2. Clean up Listing Availability
        const listing = await Listing.findById(booking.listingId).session(session);
        if (listing) {
            const updates = {};
            let loop = new Date(booking.checkInDate);
            const end = new Date(booking.checkOutDate);

            while (loop < end) {
                const dateStr = toDateId(loop);
                const dayData = listing.availability.get(dateStr) || {};
                
                // Reduce booked count and remove user from bookedBy
                const newBookedCount = Math.max(0, (dayData.bookedCount || 1) - 1);
                const newBookedBy = (dayData.bookedBy || []).filter(uid => uid !== req.user.uid);
                
                updates[`availability.${dateStr}`] = {
                    ...dayData,
                    status: newBookedCount < (listing.inventoryCount || 1) ? 'available' : 'blocked',
                    bookedCount: newBookedCount,
                    bookedBy: newBookedBy
                };
                loop.setDate(loop.getDate() + 1);
            }
            await Listing.findByIdAndUpdate(booking.listingId, { $set: updates }, { session });
        }

        // 3. Notify Chat
        const chatId = [booking.bookerId, booking.hostId].sort().join('_');
        await Chat.findOneAndUpdate(
            { chatId },
            { $set: { lastMessage: "Reservation Cancelled ❌", lastUpdated: new Date() } },
            { session }
        );

        await session.commitTransaction();
        res.json({ success: true });
    } catch (error) {
        await session.abortTransaction();
        res.status(400).json({ error: error.message });
    } finally {
        session.endSession();
    }
});

// PATCH: Update Booking Data
router.patch('/:id', requireAuth, async (req, res) => {
    try {
        const booking = await Booking.findOneAndUpdate(
            { _id: req.params.id, $or: [{ hostId: req.user.uid }, { bookerId: req.user.uid }] },
            { $set: req.body },
            { new: true }
        );
        if (!booking) return res.status(404).json({ error: 'Booking not found' });
        res.json({ id: booking._id, ...booking._doc });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update booking' });
    }
});

// POST: Create a new booking (ATOMIC TRANSACTION)
router.post('/', requireAuth, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { listingId, checkInDate, checkOutDate, selectedRooms, type } = req.body;
        const listing = await Listing.findById(listingId).session(session);
        if (!listing) throw new Error("Listing not found.");

        const freshMaxInventory = listing.inventoryCount || 1;
        let loop = new Date(checkInDate);
        const end = new Date(checkOutDate);
        let isBlockedNow = false;
        const updates = {};
        
        while (loop < end) {
            const dateStr = toDateId(loop);
            const dayData = (listing.availability && listing.availability.get(dateStr)) || {}; 
            
            let newBlockedRooms = dayData.blockedRooms || [];
            let newBookedCount = dayData.bookedCount || 0;
            
            if (type === 'hotel' || type === 'dorm') {
                const selectingBlockedRoom = selectedRooms.some(r => 
                    r.originalIndex !== undefined && newBlockedRooms.includes(r.originalIndex)
                );
                if (selectingBlockedRoom || (newBookedCount + newBlockedRooms.length) >= freshMaxInventory || dayData.status === 'blocked') {
                    isBlockedNow = true; break;
                }
                let newBlockedIndices = selectedRooms.filter(r => r.originalIndex !== undefined).map(r => r.originalIndex);
                newBlockedRooms = [...new Set([...newBlockedRooms, ...newBlockedIndices])];
                newBookedCount += selectedRooms.filter(r => r.originalIndex === undefined).length;
            } else {
                if (newBookedCount >= freshMaxInventory || dayData.status === 'blocked') {
                    isBlockedNow = true; break;
                }
                newBookedCount += 1;
            }
            
            const totalUnavailable = newBookedCount + newBlockedRooms.length;
            const newStatus = totalUnavailable >= freshMaxInventory ? 'blocked' : (dayData.status || 'available');
            const newBookedByArray = [...(dayData.bookedBy || []), req.user.uid];

            updates[`availability.${dateStr}`] = { 
                ...dayData, status: newStatus, bookedCount: newBookedCount, 
                blockedRooms: newBlockedRooms, bookedBy: newBookedByArray 
            };
            loop.setDate(loop.getDate() + 1);
        }

        if (isBlockedNow) throw new Error("Dates were just booked by someone else!");

        const generatedOtp = Math.random().toString(36).substring(2, 6).toUpperCase();
        const newBooking = new Booking({ 
            ...req.body, 
            bookerId: req.user.uid,
            checkInOtp: generatedOtp 
        });
        await newBooking.save({ session });
        await Listing.findByIdAndUpdate(listingId, { $set: updates }, { session });

        if (type !== 'hotel' && type !== 'dorm') {
            const chatId = [req.user.uid, req.body.hostId].sort().join('_');
            await Chat.findOneAndUpdate(
                { chatId: chatId },
                { 
                    $set: {
                        participants: [req.user.uid, req.body.hostId],
                        guestId: req.user.uid,
                        hostId: req.body.hostId,
                        userDetails: req.body.chatUserDetails,
                        lastMessage: "Booking Confirmed! 📅",
                        lastUpdated: new Date()
                    }
                },
                { new: true, upsert: true, session }
            );
        }

        await session.commitTransaction();
        res.status(201).json(newBooking);
    } catch (error) {
        await session.abortTransaction();
        res.status(409).json({ error: error.message });
    } finally {
        session.endSession();
    }
});

module.exports = router;