const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Listing = require('../models/Listing');
const Chat = require('../models/Chat');
const User = require('../models/User');
const { sendNotification } = require('../utils/notificationUtils');

// --- HELPERS ---
// ✅ NEW: Explicitly add 5 hours and 30 minutes (IST) to the incoming UTC timestamp
const getISTTime = (date) => {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330); // 330 minutes = 5.5 hours
    return d;
};

// Formats the adjusted date into YYYY-MM-DD
const toDateId = (adjustedDate) => {
    const year = adjustedDate.getUTCFullYear();
    const month = String(adjustedDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(adjustedDate.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// 1. FETCH ACTIVE AND UPCOMING RESERVATIONS FOR THE HOST
const getHostReservations = async (req, res) => {
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
};

// 2. FETCH TRIPS FOR THE LOGGED-IN GUEST
const getMyTrips = async (req, res) => {
    try {
        const bookings = await Booking.find({ bookerId: req.user.uid })
            .sort({ checkInDate: 1 });

        const formatted = bookings.map(b => ({ id: b._id, ...b._doc }));
        res.json(formatted);
    } catch (error) {
        console.error("Failed to fetch trips:", error);
        res.status(500).json({ error: 'Failed to fetch trips' });
    }
};

// 3. GET SINGLE BOOKING BY ID
const getBookingById = async (req, res) => {
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
};

// 4. CANCEL BOOKING (Handles Calendar Cleanup + Chat Update + Notifications)
const cancelBooking = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const booking = await Booking.findById(req.params.id).session(session);
        if (!booking) throw new Error("Booking not found");
        if (booking.bookerId !== req.user.uid) throw new Error("Unauthorized");

        // 1. Update Booking Status (to pending_refund for admin to approve)
        booking.status = 'pending_refund';
        await booking.save({ session });

        // 2. Clean up Listing Availability
        const listing = await Listing.findById(booking.listingId).session(session);
        if (listing) {
            const updates = {};
            
            // ✅ FIX: SHIFT TO IST, THEN NORMALIZE TO MIDNIGHT
            let loop = getISTTime(booking.checkInDate);
            loop.setUTCHours(0, 0, 0, 0); 
            const end = getISTTime(booking.checkOutDate);
            end.setUTCHours(0, 0, 0, 0);

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
                
                // Step forward 1 exact calendar day
                loop.setUTCDate(loop.getUTCDate() + 1);
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

        // ✅ SEND PUSH NOTIFICATION TO HOST
        try {
            await sendNotification({
                userId: booking.hostId,
                title: "Reservation Cancelled ❌",
                body: `A guest cancelled their trip for ${new Date(booking.checkInDate).toLocaleDateString()}.`,
                type: "booking",
                relatedId: booking._id.toString()
            });
        } catch (notifErr) { console.error("Notif error:", notifErr); }

        res.json({ success: true });
    } catch (error) {
        await session.abortTransaction();
        res.status(400).json({ error: error.message });
    } finally {
        session.endSession();
    }
};

// 5. UPDATE BOOKING DATA
const updateBooking = async (req, res) => {
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
};

// 6. CREATE A NEW BOOKING (ATOMIC TRANSACTION + NOTIFICATIONS)
const createBooking = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { listingId, checkInDate, checkOutDate, selectedRooms, type } = req.body;
        const listing = await Listing.findById(listingId).session(session);
        if (!listing) throw new Error("Listing not found.");

        const freshMaxInventory = listing.inventoryCount || 1;
        
        // ✅ FIX: SHIFT TO IST, THEN NORMALIZE TO MIDNIGHT
        let loop = getISTTime(checkInDate);
        loop.setUTCHours(0, 0, 0, 0);
        const end = getISTTime(checkOutDate);
        end.setUTCHours(0, 0, 0, 0);
        
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
            
            // Step forward 1 exact calendar day
            loop.setUTCDate(loop.getUTCDate() + 1);
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

        // Initialize Chat for Homes/Barns
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

        // ✅ SEND NOTIFICATIONS NOW THAT DB SAVES ARE SUCCESSFUL
        try {
            await sendNotification({
                userId: req.user.uid,
                title: "Booking Confirmed! 🎉",
                body: `Your trip to ${listing.location || 'your destination'} is locked in.`,
                type: "booking",
                relatedId: newBooking._id.toString()
            });

            await sendNotification({
                userId: req.body.hostId,
                title: "New Booking Received! 💰",
                body: `Someone just booked your property for ${new Date(checkInDate).toLocaleDateString()}.`,
                type: "booking",
                relatedId: newBooking._id.toString()
            });
        } catch (notifErr) { console.error("Notification trigger error:", notifErr); }

        res.status(201).json({ id: newBooking._id, ...newBooking._doc });
    } catch (error) {
        await session.abortTransaction();
        res.status(409).json({ error: error.message });
    } finally {
        session.endSession();
    }
};

const searchGuest = async (req, res) => {
    try {
        const { phone, email } = req.query;
        if (!phone && !email) {
            return res.status(400).json({ error: "Provide a phone number or email to search." });
        }

        // 1. Search registered users first
        let query = {};
        if (phone) query.phoneNumber = phone;
        else if (email) query.email = email;

        const user = await User.findOne(query);
        if (user) {
            return res.json({
                bookerName: user.name,
                bookerEmail: user.email,
                bookerPhone: user.phoneNumber,
                found: true,
                type: 'registered'
            });
        }

        // 2. Search past bookings of this host
        const bookingQuery = { hostId: req.user.uid };
        if (phone) {
            bookingQuery.bookerPhone = phone;
        } else if (email) {
            bookingQuery.bookerEmail = email;
        }

        const latestBooking = await Booking.findOne(bookingQuery).sort({ createdAt: -1 });
        if (latestBooking) {
            return res.json({
                bookerName: latestBooking.bookerName,
                bookerEmail: latestBooking.bookerEmail,
                bookerPhone: latestBooking.bookerPhone || phone,
                guestIdType: latestBooking.guestIdType || '',
                guestIdNumber: latestBooking.guestIdNumber || '',
                guestIdImage: latestBooking.guestIdImage || '',
                found: true,
                type: 'walk-in'
            });
        }

        res.json({ found: false });
    } catch (error) {
        console.error("Search guest error:", error);
        res.status(500).json({ error: "Failed to search guest details" });
    }
};

module.exports = {
    getHostReservations,
    getMyTrips,
    getBookingById,
    cancelBooking,
    updateBooking,
    createBooking,
    searchGuest
};