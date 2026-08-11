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

// ✅ 0. SEND OTP FOR ADMIN DELETE VERIFICATION
router.post('/send-delete-otp', async (req, res) => {
    try {
        const generatedOtp = '1234'; 
        const adminId = req.user ? (req.user.uid || req.user.id) : null;

        if (adminId && require('mongoose').Types.ObjectId.isValid(adminId)) {
            await User.findByIdAndUpdate(adminId, {
                $set: {
                    deleteOtp: generatedOtp,
                    deleteOtpExpires: new Date(Date.now() + 5 * 60 * 1000)
                }
            });
        }

        console.log(`[SECURITY OTP] Admin Delete OTP generated: ${generatedOtp}`);
        res.json({ success: true, message: 'Security OTP sent for deletion verification. (Code: 1234)', otp: generatedOtp });
    } catch (error) {
        console.error("Failed to send delete OTP:", error);
        res.status(500).json({ error: 'Failed to send Security OTP' });
    }
});

const verifyAdminDeleteOtp = async (adminId, providedOtp) => {
    if (!providedOtp) return false;
    if (providedOtp.trim() === '1234') return true; // Dev test OTP
    if (adminId && require('mongoose').Types.ObjectId.isValid(adminId)) {
        const admin = await User.findById(adminId);
        if (admin && admin.deleteOtp && admin.deleteOtp === providedOtp.trim() && admin.deleteOtpExpires > new Date()) {
            return true;
        }
    }
    return false;
};

// 1. GET ALL USERS (Guests, Hosts, Admins)
router.get('/users', async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 }).lean();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// 1.5 GET ALL DELETE REQUESTS
router.get('/delete-requests', async (req, res) => {
    try {
        const users = await User.find({ deleteRequested: true }).sort({ createdAt: -1 }).lean();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch delete requests' });
    }
});

// 1.6 DENY DELETE REQUEST
router.post('/delete-requests/:id/deny', async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, { $set: { deleteRequested: false } }, { new: true });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, message: 'Delete request denied and removed.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to deny delete request' });
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

// 2.1 CREATE NEW LISTING (Admin Flow)
router.post('/listings', async (req, res) => {
    try {
        const listingData = req.body;
        let hostId = req.user ? (req.user.uid || req.user.id) : 'admin_host';
        let hostName = (req.user && req.user.name) || 'Admin Host';
        let assignedPhoneNumber = null;

        if (listingData.assignedPhoneNumber) {
            const cleanPhone = listingData.assignedPhoneNumber.replace(/[^0-9]/g, '');
            assignedPhoneNumber = cleanPhone;
            const targetUser = await User.findOne({ phoneNumber: cleanPhone });
            if (targetUser) {
                hostId = targetUser._id.toString();
                hostName = targetUser.name || `User ${cleanPhone.slice(-4)}`;
                targetUser.isHost = true;
                targetUser.verificationStatus = 'verified';
                await targetUser.save();
            }
        }

        const newListing = new Listing({
            ...listingData,
            hostId,
            hostName: listingData.hostName || hostName,
            assignedPhoneNumber,
            status: listingData.status || 'active',
            createdAt: new Date()
        });

        await newListing.save();
        res.status(201).json({ id: newListing._id, ...newListing._doc });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create listing: ' + error.message });
    }
});

// 2.2 ASSIGN LISTING TO MOBILE NUMBER
router.patch('/listings/:id/assign', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) {
            return res.status(400).json({ error: 'Mobile number is required' });
        }

        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
        if (cleanPhone.length < 10) {
            return res.status(400).json({ error: 'Invalid 10-digit mobile number' });
        }

        const listing = await Listing.findById(req.params.id);
        if (!listing) return res.status(404).json({ error: 'Listing not found' });

        listing.assignedPhoneNumber = cleanPhone;
        listing.status = 'active';

        const targetUser = await User.findOne({ phoneNumber: cleanPhone });
        if (targetUser) {
            listing.hostId = targetUser._id.toString();
            listing.hostName = targetUser.name || `User ${cleanPhone.slice(-4)}`;
            targetUser.isHost = true;
            targetUser.verificationStatus = 'verified';
            await targetUser.save();
        }

        await listing.save();
        res.json({ success: true, message: `Listing assigned to ${cleanPhone}`, listing });
    } catch (error) {
        res.status(500).json({ error: 'Failed to assign listing' });
    }
});

// ✅ 2.3 APPROVE / REJECT LISTING STATUS & REJECTION REASON
router.patch('/listings/:id/status', async (req, res) => {
    try {
        const { status, rejectionReason } = req.body;
        if (!['active', 'approved', 'rejected', 'pending', 'unlisted'].includes(status)) {
            return res.status(400).json({ error: 'Invalid listing status' });
        }

        const normalizedStatus = status === 'approved' ? 'active' : status;
        const updateFields = {
            status: normalizedStatus,
            rejectionReason: normalizedStatus === 'rejected' ? (rejectionReason || 'Listing requires corrections before approval.') : ''
        };

        const updatedListing = await Listing.findByIdAndUpdate(
            req.params.id,
            { $set: updateFields },
            { new: true }
        );

        if (!updatedListing) {
            return res.status(404).json({ error: 'Listing not found' });
        }

        res.json({ success: true, message: `Listing status updated to ${normalizedStatus}`, listing: updatedListing });
    } catch (error) {
        console.error("Failed to update listing status:", error);
        res.status(500).json({ error: 'Failed to update listing status' });
    }
});

// ✅ 2.5 DELETE LISTING (Requires OTP)
router.delete('/listings/:id', async (req, res) => {
    try {
        const otp = req.headers['x-admin-otp'] || req.body?.otp || req.query?.otp;
        const isValidOtp = await verifyAdminDeleteOtp(req.user?.uid || req.user?.id, otp);
        if (!isValidOtp) {
            return res.status(400).json({ error: 'Invalid or expired Security OTP. Enter 1234 to confirm deletion.' });
        }

        const deletedListing = await Listing.findByIdAndDelete(req.params.id);
        
        if (!deletedListing) {
            return res.status(404).json({ error: 'Listing not found in database' });
        }

        res.json({ success: true, message: 'Property permanently deleted.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete listing from server: ' + error.message });
    }
});

// 3. GET ALL BOOKINGS
router.get('/bookings', async (req, res) => {
    try {
        const bookings = await Booking.find().sort({ createdAt: -1 });
        const listings = await Listing.find();
        const listingMap = {};
        listings.forEach(l => {
            listingMap[l._id.toString()] = l;
        });

        const formatted = bookings.map(b => {
            const prop = listingMap[b.listingId?.toString()] || {};
            return {
                id: b._id,
                ...b._doc,
                checkInTime: b.checkInTime || prop.checkInTime || '08:00 AM',
                checkOutTime: b.checkOutTime || prop.checkOutTime || '07:00 AM'
            };
        });

        res.json(formatted);
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

        res.status(500).json({ error: error.description || 'Failed to process refund with Razorpay' });
    }
});

// ✅ 3.6 APPROVE/REJECT/UNVERIFY HOST VERIFICATION & DELETE ID DOCUMENTS
router.post('/users/:id/verify', async (req, res) => {
    try {
        const { status, wipeDocuments } = req.body;
        if (!['verified', 'rejected', 'unverified'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        const updateDoc = { verificationStatus: status };
        if (wipeDocuments || status === 'unverified') {
            updateDoc.idCardFront = null;
            updateDoc.idCardBack = null;
            updateDoc.idDocumentUrl = null;
            updateDoc.idType = null;
            updateDoc.idNumber = null;
            updateDoc.rejectionReason = null;
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { $set: updateDoc },
            { new: true }
        );

        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ error: 'Failed to verify host' });
    }
});

router.delete('/users/:id/id-documents', async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { 
                $set: { 
                    verificationStatus: 'unverified',
                    idCardFront: null,
                    idCardBack: null,
                    idDocumentUrl: null,
                    idType: null,
                    idNumber: null,
                    rejectionReason: null
                } 
            },
            { new: true }
        );

        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, message: 'ID documents wiped and status reset to unverified.', user });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete ID documents' });
    }
});

// ✅ 4. UPDATE USER / ADMIN (Edit Name, Email, Roles, Password)
router.patch('/users/:id', async (req, res) => {
    try {
        const { name, phoneNumber, email, isAdmin, isHost, password } = req.body;
        const updateFields = {};

        if (name !== undefined) updateFields.name = name;
        if (phoneNumber !== undefined) updateFields.phoneNumber = phoneNumber;
        if (email !== undefined) updateFields.email = email;
        if (isAdmin !== undefined) updateFields.isAdmin = Boolean(isAdmin);
        if (isHost !== undefined) updateFields.isHost = Boolean(isHost);

        if (password) {
            updateFields.password = await bcrypt.hash(password, 10);
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.params.id, 
            { $set: updateFields }, 
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found in database' });
        }

        res.json(updatedUser);
    } catch (error) {
        console.error("Failed to update user/admin:", error);
        res.status(500).json({ error: 'Failed to update user/admin details: ' + error.message });
    }
});

// ✅ 5. DELETE USER (Wipe from MongoDB AND Delete their Listings) (Requires OTP)
router.delete('/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const otp = req.headers['x-admin-otp'] || req.body?.otp || req.query?.otp;

        const isValidOtp = await verifyAdminDeleteOtp(req.user?.uid || req.user?.id, otp);
        if (!isValidOtp) {
            return res.status(400).json({ error: 'Invalid or expired Security OTP. Enter 1234 to confirm deletion.' });
        }

        if (req.user?.uid === userId) {
            return res.status(403).json({ error: "Action Denied: You cannot delete your own Master Admin account." });
        }

        const deletedListings = await Listing.deleteMany({ hostId: userId });

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
        res.status(500).json({ error: 'Failed to completely delete user: ' + error.message });
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

        res.status(500).json({ error: 'Failed to update booking' });
    }
});

// ✅ 8. DELETE BOOKING (Completely wipe record from database) (Requires OTP)
router.delete('/bookings/:id', async (req, res) => {
    try {
        const otp = req.headers['x-admin-otp'] || req.body?.otp || req.query?.otp;
        const isValidOtp = await verifyAdminDeleteOtp(req.user?.uid || req.user?.id, otp);
        if (!isValidOtp) {
            return res.status(400).json({ error: 'Invalid or expired Security OTP. Enter 1234 to confirm deletion.' });
        }

        const deletedBooking = await Booking.findByIdAndDelete(req.params.id);
        
        if (!deletedBooking) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        res.json({ success: true, message: 'Booking permanently deleted.' });
    } catch (error) {

        res.status(500).json({ error: 'Failed to delete booking: ' + error.message });
    }
});

router.put('/pricing', updatePricing);

router.get('/support-tickets', async (req, res) => {
    try {
        const tickets = await SupportTicket.find().sort({ updatedAt: -1 }).lean(); 
        
        const userTicketsMap = {};

        // Populate latest user info and group tickets by userId
        for (let ticket of tickets) {
            try {
                const user = await User.findById(ticket.userId);
                if (user) {
                    ticket.userName = user.name || ticket.userName;
                    ticket.userEmail = user.email || ticket.userEmail;
                    ticket.userPhone = user.phoneNumber || ticket.userPhone;
                    ticket.userPhoto = user.photoURL || null;
                }
            } catch (err) {

            }

            if (!userTicketsMap[ticket.userId]) {
                userTicketsMap[ticket.userId] = { ...ticket, messages: [...ticket.messages] };
            } else {
                // Prepend older messages to the merged ticket
                userTicketsMap[ticket.userId].messages = [
                    ...ticket.messages,
                    ...userTicketsMap[ticket.userId].messages
                ];
                // Keep the most recent status if the latest one was resolved but an older one was open (shouldn't happen, but just in case)
            }
        }

        const mergedTickets = Object.values(userTicketsMap).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        res.json(mergedTickets);
    } catch (error) {

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

        }

        res.json(ticket);
    } catch (error) {
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// 3. MARK TICKET AS RESOLVED
router.patch('/support-tickets/:ticketId/resolve', async (req, res) => {
    try {
        const ticket = await SupportTicket.findById(req.params.ticketId);
        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

        // Add automated system message before resolving
        ticket.messages.push({
            sender: 'system',
            text: 'Hope you have a better experience with the chat!\nThe issue is resolved.'
        });

        ticket.status = 'resolved';
        await ticket.save();

        // Broadcast ticket resolution via Socket.io
        try {
            const io = req.app.get('io');
            const roomName = `support_${ticket._id}`;
            
            // Broadcast the new system message first
            const sysMsg = ticket.messages[ticket.messages.length - 1];
            io.to(roomName).emit('receive_support_message', { ticketId: ticket._id, message: sysMsg });
            io.to('support_admins').emit('receive_support_message', { ticketId: ticket._id, message: sysMsg });

            io.to(roomName).emit('support_ticket_resolved', { ticketId: ticket._id });

            // Also broadcast to the support_admins room
            io.to('support_admins').emit('support_ticket_resolved', { ticketId: ticket._id });
        } catch (socketError) {

        }

        res.json(ticket);
    } catch (error) {
        res.status(500).json({ error: 'Failed to resolve ticket' });
    }
});

// ✅ SYSTEM LOGS ENDPOINTS
const fs = require('fs');
const path = require('path');

router.get('/logs', (req, res) => {
    try {
        const logPath = path.join(__dirname, '../server.log');
        if (!fs.existsSync(logPath)) return res.json({ logs: "No logs found." });
        
        // Read the last X characters or lines to avoid sending a massive file.
        // For simplicity, we'll read the whole file. In production, consider tailing.
        const logs = fs.readFileSync(logPath, 'utf8');
        res.json({ logs });
    } catch (error) {
        res.status(500).json({ error: 'Failed to read logs' });
    }
});

router.delete('/logs', (req, res) => {
    try {
        const logPath = path.join(__dirname, '../server.log');
        if (fs.existsSync(logPath)) {
            fs.writeFileSync(logPath, ''); // clear the file
        }
        res.json({ success: true, message: 'Logs cleared.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear logs' });
    }
});

module.exports = router;