const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Listing = require('../models/Listing');
const Chat = require('../models/Chat');
const User = require('../models/User');
const Message = require('../models/Message');
const WalkInGuest = require('../models/WalkInGuest');
const { sendNotification } = require('../utils/notificationUtils');
const { getPaginationParams, formatPaginatedResponse } = require('../utils/pagination');

// --- HELPERS ---
const getISTTime = (date) => {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330); // 330 minutes = 5.5 hours
    return d;
};

// Helper to parse checkout Date + Time (e.g. "2026-08-11" and "07:00 AM" / "08:00 AM" / "11:00 AM")
const isCheckOutOverdue = (checkOutDate, checkOutTime, now = new Date()) => {
    if (!checkOutDate) return false;

    let year, month, day;
    if (typeof checkOutDate === 'string' && checkOutDate.length >= 10) {
        const parts = checkOutDate.slice(0, 10).split('-');
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[2], 10);
    } else {
        const d = new Date(checkOutDate);
        if (isNaN(d.getTime())) return false;
        year = d.getFullYear();
        month = d.getMonth();
        day = d.getDate();
    }

    let hour = 7; // Default 07:00 AM checkout
    let minute = 0;

    if (checkOutTime && typeof checkOutTime === 'string') {
        const match = checkOutTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
        if (match) {
            hour = parseInt(match[1], 10);
            minute = parseInt(match[2], 10);
            const ampm = match[3] ? match[3].toUpperCase() : null;
            if (ampm === 'PM' && hour < 12) hour += 12;
            if (ampm === 'AM' && hour === 12) hour = 0;
        }
    }

    const checkOutDateTime = new Date(year, month, day, hour, minute, 0, 0);
    return now >= checkOutDateTime;
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
        const now = new Date();

        // Fetch host listings to map checkOutTime
        const hostListings = await Listing.find({ hostId: req.user.uid });
        const listingMap = {};
        hostListings.forEach(l => {
            listingMap[l._id.toString()] = l;
        });

        const filter = {
            hostId: req.user.uid,
            status: { $in: ['upcoming', 'active'] }
        };

        const bookings = await Booking.find(filter).sort({ checkInDate: 1 });

        const formatted = [];
        for (const b of bookings) {
            const prop = listingMap[b.listingId?.toString()] || {};
            const checkInTime = b.checkInTime || prop.checkInTime || '08:00 AM';
            const checkOutTime = b.checkOutTime || prop.checkOutTime || '07:00 AM';

            let currentStatus = b.status;
            // Check if checkout time has passed
            if (isCheckOutOverdue(b.checkOutDate, checkOutTime, now) && currentStatus !== 'cancelled') {
                currentStatus = 'completed';
                // Auto-update DB asynchronously
                Booking.findByIdAndUpdate(b._id, { $set: { status: 'completed' } }).catch(console.error);
            }

            formatted.push({
                id: b._id,
                ...b._doc,
                status: currentStatus,
                checkInTime,
                checkOutTime,
                location: b.location || prop.location || ''
            });
        }

        res.json(formatted);
    } catch (error) {
        console.error("Failed to fetch host reservations:", error);
        res.status(500).json({ error: 'Failed to fetch reservations' });
    }
};

// 2. FETCH TRIPS FOR THE LOGGED-IN GUEST
const getMyTrips = async (req, res) => {
    try {
        const { page, limit, skip } = getPaginationParams(req.query);
        const filter = { bookerId: req.user.uid };

        const total = await Booking.countDocuments(filter);
        const bookings = await Booking.find(filter)
            .sort({ checkInDate: 1 })
            .skip(skip)
            .limit(limit);

        const formatted = bookings.map(b => {
            let inTime = b.checkInTime || '08:00 AM';
            let outTime = b.checkOutTime || '07:00 AM';
            if (inTime === '09:00 AM') inTime = '08:00 AM';
            if (outTime === '08:00 AM') outTime = '07:00 AM';
            return { id: b._id, ...b._doc, checkInTime: inTime, checkOutTime: outTime };
        });
        res.json(formatPaginatedResponse(formatted, total, page, limit));
    } catch (error) {

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

        // Fetch host details safely (handle legacy Firebase UID strings)
        let hostDetails = null;
        if (booking.hostId) {
            try {
                const isValidObjectId = mongoose.Types.ObjectId.isValid(booking.hostId);
                let host = null;
                
                if (isValidObjectId) {
                    host = await User.findById(booking.hostId);
                } else {
                    // Bypass Mongoose strict casting by using native MongoDB driver
                    // for legacy Firebase string _id values
                    host = await User.collection.findOne({ _id: booking.hostId });
                    if (!host) {
                        // Also check if they stored it in a `uid` field just in case
                        host = await User.collection.findOne({ uid: booking.hostId });
                    }
                }

                if (host) {
                    hostDetails = {
                        name: host.name,
                        phoneNumber: host.phoneNumber,
                        photoURL: host.photoURL
                    };
                }
            } catch (err) {

            }
        }

        let inTime = booking.checkInTime || '08:00 AM';
        let outTime = booking.checkOutTime || '07:00 AM';
        if (inTime === '09:00 AM') inTime = '08:00 AM';
        if (outTime === '08:00 AM') outTime = '07:00 AM';

        res.json({ id: booking._id, ...booking._doc, checkInTime: inTime, checkOutTime: outTime, hostDetails });
    } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
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
        
        const lastMsgObj = await Message.findOne({ chatId }).sort({ createdAt: -1 }).session(session);
        let newLastMsg = "";
        if (lastMsgObj) {
            newLastMsg = lastMsgObj.text || (lastMsgObj.image ? "📷 Image" : "📍 Location");
        }

        await Chat.findOneAndUpdate(
            { chatId },
            { $set: { lastMessage: newLastMsg, lastUpdated: new Date() } },
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
        const booking = await Booking.findOne({ _id: req.params.id, $or: [{ hostId: req.user.uid }, { bookerId: req.user.uid }] });
        if (!booking) return res.status(404).json({ error: 'Booking not found' });
        
        const wasNotCheckedIn = !booking.checkInConfirmed;
        const isCheckingInNow = req.body.checkInConfirmed === true;
        
        // Update fields
        Object.assign(booking, req.body);
        
        // ✅ If guest successfully checked in just now, credit the host's wallet!
        if (wasNotCheckedIn && isCheckingInNow) {
            const Transaction = require('../models/Transaction');
            
            // Amount is basePrice. If missing, fallback to 80% of total price
            const amountToCredit = booking.priceBreakdown?.basePrice || (booking.totalPrice * 0.8);
            
            // Increment Host Wallet
            await User.findOneAndUpdate(
                { _id: booking.hostId }, 
                { $inc: { walletBalance: amountToCredit } }
            );
            
            // Create Transaction Record
            await Transaction.create({
                userId: booking.hostId,
                amount: amountToCredit,
                type: 'credit',
                description: `Payment for booking at ${booking.title || 'your listing'}`,
                bookingId: booking._id
            });
            
            // Optional: send host a notification about payout
            try {
                await sendNotification({
                    userId: booking.hostId,
                    title: "Wallet Credited! 💸",
                    body: `₹${amountToCredit.toLocaleString()} has been added to your wallet for a check-in.`,
                    type: "wallet",
                    relatedId: booking._id.toString()
                });
            } catch (e) {}
        }
        
        await booking.save();
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
            checkInTime: req.body.checkInTime || listing.checkInTime || '08:00 AM',
            checkOutTime: req.body.checkOutTime || listing.checkOutTime || '07:00 AM',
            bookerId: req.user.uid,
            checkInOtp: generatedOtp 
        });
        await newBooking.save({ session });
        await Listing.findByIdAndUpdate(listingId, { $set: updates }, { session });

        // Save or update guest in host's WalkInGuest collection
        if (req.body.bookerPhone && req.body.bookerName) {
            const hostTargetId = req.body.hostId || req.user.uid;
            await WalkInGuest.findOneAndUpdate(
                { hostId: hostTargetId, bookerPhone: req.body.bookerPhone },
                {
                    $set: {
                        hostId: hostTargetId,
                        listingId: req.body.listingId,
                        bookerName: req.body.bookerName,
                        bookerEmail: req.body.bookerEmail || '',
                        bookerPhone: req.body.bookerPhone,
                        guestIdType: req.body.guestIdType || 'Aadhaar',
                        guestIdNumber: req.body.guestIdNumber || '',
                        guestIdImage: req.body.guestIdImage || '',
                        lastStayDate: new Date()
                    },
                    $inc: { visitCount: 1 }
                },
                { upsert: true, new: true, session }
            );
        }

        // Initialize Chat for Homes/Barns
        if (type !== 'hotel' && type !== 'dorm') {
            const chatId = [req.user.uid, req.body.hostId].sort().join('_');
            
            const lastMsgObj = await Message.findOne({ chatId }).sort({ createdAt: -1 }).session(session);
            let newLastMsg = "";
            if (lastMsgObj) {
                newLastMsg = lastMsgObj.text || (lastMsgObj.image ? "📷 Image" : "📍 Location");
            }

            await Chat.findOneAndUpdate(
                { chatId: chatId },
                { 
                    $set: {
                        participants: [req.user.uid, req.body.hostId],
                        guestId: req.user.uid,
                        hostId: req.body.hostId,
                        userDetails: req.body.chatUserDetails,
                        lastMessage: newLastMsg,
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
        if (res.headersSent) throw error;
        res.status(409).json({ error: error.message });
        throw error;
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

        const hostId = req.user.uid;

        // 1. Search host's WalkInGuest collection specifically (DO NOT search mobile app users)
        let query = { hostId };
        if (phone) {
            query.bookerPhone = phone;
        } else if (email) {
            query.bookerEmail = email;
        }

        let guest = await WalkInGuest.findOne(query).sort({ updatedAt: -1 });

        // 2. Fallback: Search previous walk-in bookings for this host if WalkInGuest record does not exist yet
        if (!guest) {
            const bookingQuery = { hostId };
            if (phone) bookingQuery.bookerPhone = phone;
            else if (email) bookingQuery.bookerEmail = email;

            const latestBooking = await Booking.findOne(bookingQuery).sort({ createdAt: -1 });
            if (latestBooking && latestBooking.bookerName) {
                guest = {
                    bookerName: latestBooking.bookerName,
                    bookerEmail: latestBooking.bookerEmail || '',
                    bookerPhone: latestBooking.bookerPhone || phone,
                    guestIdType: latestBooking.guestIdType || 'Aadhaar',
                    guestIdNumber: latestBooking.guestIdNumber || '',
                    guestIdImage: latestBooking.guestIdImage || ''
                };
            }
        }

        if (guest) {
            return res.json({
                bookerName: guest.bookerName,
                bookerEmail: guest.bookerEmail || '',
                bookerPhone: guest.bookerPhone || phone,
                guestIdType: guest.guestIdType || 'Aadhaar',
                guestIdNumber: guest.guestIdNumber || '',
                guestIdImage: guest.guestIdImage || '',
                found: true,
                type: 'walk-in'
            });
        }

        res.json({ found: false });
    } catch (error) {
        console.error("Failed to search walk-in guest details:", error);
        res.status(500).json({ error: "Failed to search guest details" });
    }
};

// 8. FETCH ALL BOOKINGS & REPORTS FOR HOST (DAILY, MONTHLY, ALL TIME)
const getAllHostBookings = async (req, res) => {
    try {
        const { timeRange, date, month, year, listingId } = req.query;
        let filter = { hostId: req.user.uid };

        if (listingId && listingId !== 'all') {
            filter.listingId = listingId;
        }

        const hostListings = await Listing.find({ hostId: req.user.uid });
        const listingMap = {};
        hostListings.forEach(l => {
            listingMap[l._id.toString()] = l;
        });

        const now = new Date();
        const bookings = await Booking.find(filter).sort({ createdAt: -1 });
        let formatted = bookings.map(b => {
            const prop = listingMap[b.listingId?.toString()] || {};
            const checkInTime = b.checkInTime || prop.checkInTime || '08:00 AM';
            const checkOutTime = b.checkOutTime || prop.checkOutTime || '07:00 AM';

            let currentStatus = b.status;
            if (isCheckOutOverdue(b.checkOutDate, checkOutTime, now) && currentStatus !== 'cancelled') {
                currentStatus = 'completed';
                Booking.findByIdAndUpdate(b._id, { $set: { status: 'completed' } }).catch(console.error);
            }

            return {
                id: b._id,
                ...b._doc,
                status: currentStatus,
                checkInTime,
                checkOutTime,
                location: b.location || prop.location || ''
            };
        });

        // Filter in JavaScript to support both String & Date object schemas cleanly
        if (timeRange === 'daily' && date) {
            formatted = formatted.filter(b => {
                if (!b.checkInDate) return false;
                const dStr = typeof b.checkInDate === 'string' 
                    ? b.checkInDate.slice(0, 10) 
                    : new Date(b.checkInDate).toISOString().slice(0, 10);
                return dStr === date;
            });
        } else if (timeRange === 'monthly' && month && year) {
            const targetMonthStr = `${year}-${String(month).padStart(2, '0')}`;
            formatted = formatted.filter(b => {
                if (!b.checkInDate) return false;
                const dStr = typeof b.checkInDate === 'string' 
                    ? b.checkInDate.slice(0, 7) 
                    : new Date(b.checkInDate).toISOString().slice(0, 7);
                return dStr === targetMonthStr;
            });
        }

        let totalRevenue = 0;
        let activeCount = 0;
        let completedCount = 0;
        let cancelledCount = 0;

        formatted.forEach(b => {
            if (b.status !== 'cancelled') {
                totalRevenue += (Number(b.totalPrice) || 0);
            }
            if (b.status === 'active' || b.status === 'upcoming') activeCount++;
            else if (b.status === 'completed' || b.status === 'checked-out' || b.status === 'checkedout') completedCount++;
            else if (b.status === 'cancelled') cancelledCount++;
        });

        res.json({
            bookings: formatted,
            summary: {
                totalBookings: formatted.length,
                totalRevenue,
                activeCount,
                completedCount,
                cancelledCount
            }
        });
    } catch (error) {
        console.error("Failed to fetch all host bookings:", error);
        res.status(500).json({ error: "Failed to fetch booking reports" });
    }
};

// 9. HOST MANUAL CHECK-IN
const checkInBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ error: 'Booking not found' });

        booking.status = 'active';
        booking.checkInConfirmed = true;
        booking.checkedInAt = new Date();
        await booking.save();

        res.json({ success: true, message: 'Guest checked in successfully', booking });
    } catch (error) {
        res.status(500).json({ error: 'Failed to check in guest' });
    }
};

// 10. HOST MANUAL CHECK-OUT
const checkOutBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ error: 'Booking not found' });

        booking.status = 'completed';
        booking.checkedOutAt = new Date();
        await booking.save();

        res.json({ success: true, message: 'Guest checked out successfully', booking });
    } catch (error) {
        res.status(500).json({ error: 'Failed to check out guest' });
    }
};

module.exports = {
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
};