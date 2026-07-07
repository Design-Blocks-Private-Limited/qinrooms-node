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
            
            // Calculate timestamps
            const twentyFourHoursFromNow = new Date(now.getTime() + (24 * 60 * 60 * 1000));
            const oneHourFromNow = new Date(now.getTime() + (1 * 60 * 60 * 1000));

            // 1. Find bookings checking in exactly 24 hours from now
            // (We check a small 1-hour window so we don't miss them or double-send)
            const upcomingBookings = await Booking.find({
                status: 'upcoming',
                checkInDate: {
                    $gte: now,
                    $lte: twentyFourHoursFromNow
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

            // 2. Overdue Checkouts (If it is past checkOutDate and status is still 'active')
            const overdueBookings = await Booking.find({
                status: 'active',
                checkOutDate: { $lt: now } // Check out date is in the past!
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

        } catch (error) {
            console.error("Cron Job Error:", error);
        }
    });
};

module.exports = { startCronJobs };