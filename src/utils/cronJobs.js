const cron = require('node-cron');
const mongoose = require('mongoose');
const { sendNotification } = require('./notificationUtils');
const Booking = require('../models/Booking');
const Listing = require('../models/Listing');

const startCronJobs = () => {
    console.log("⏰ Notification Cron Jobs Started...");

    // This runs EVERY HOUR at the top of the hour (e.g., 1:00, 2:00, 3:00)
    cron.schedule('0 * * * *', async () => {
        try {
            const now = new Date();
            
            // Calculate timestamps based on midnight-stored dates in DB
            // Check-in is at 9:00 AM, so checkInDate + 9 hours is the real time.
            // We want to send reminder 24 hours before that, so exactly at (checkInDate + 9 hours - 24 hours) = checkInDate - 15 hours.
            // If we are checking "now", we look for bookings where checkInDate is between (now + 15 hours) and (now + 16 hours)
            const fifteenHoursFromNow = new Date(now.getTime() + (15 * 60 * 60 * 1000));
            const sixteenHoursFromNow = new Date(now.getTime() + (16 * 60 * 60 * 1000));

            // 1. Find bookings checking in exactly 24 hours from now
            // (We check a small 1-hour window so we don't miss them or double-send)
            const upcomingBookings = await Booking.find({
                status: 'upcoming',
                checkInDate: {
                    $gte: fifteenHoursFromNow,
                    $lte: sixteenHoursFromNow
                }
            });

            for (const booking of upcomingBookings) {
                // To prevent spamming, we'd ideally add a 'reminderSent' boolean to the booking model.
                // For now, we will just send it if it's within the right time frame.
                await sendNotification({
                    userId: booking.bookerId,
                    title: "Pack your bags! 🧳",
                    body: "Your trip check-in is less than 24 hours away.",
                    type: "reminder",
                    relatedId: booking._id.toString()
                });
            }

            // 2. Overdue Checkouts (If it is past checkOutDate + 8 hours and status is still 'active')
            // Checkout is at 8:00 AM. So actual checkout time is checkOutDate + 8 hours.
            // A booking is overdue if (checkOutDate + 8 hours) < now
            // Which is equivalent to: checkOutDate < (now - 8 hours)
            const eightHoursAgo = new Date(now.getTime() - (8 * 60 * 60 * 1000));
            
            const overdueBookings = await Booking.find({
                status: 'active',
                checkOutDate: { $lt: eightHoursAgo } 
            });

            for (const booking of overdueBookings) {
                await sendNotification({
                    userId: booking.bookerId,
                    title: "Checkout Overdue ⏰",
                    body: "Your checkout time has passed. Please contact the host or check out immediately.",
                    type: "reminder",
                    relatedId: booking._id.toString()
                });
            }

            // 3. Mark expired bookings as completed
            const expiredBookingsResult = await Booking.updateMany(
                {
                    status: { $in: ['upcoming', 'active'] },
                    checkOutDate: { $lt: eightHoursAgo } 
                },
                { $set: { status: 'completed' } }
            );

            if (expiredBookingsResult.modifiedCount > 0) {
                console.log(`[CRON] Automatically marked ${expiredBookingsResult.modifiedCount} bookings as completed.`);
            }

        } catch (error) {
            console.error("Cron Job Error:", error);
        }
    });
};

module.exports = { startCronJobs };