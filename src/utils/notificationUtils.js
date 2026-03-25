const Notification = require('../models/Notification');
const User = require('../models/User');

/**
 * Master Notification Function
 * Saves to MongoDB and sends an actual Push Notification to the phone
 */
const sendNotification = async ({ userId, title, body, type = 'system', relatedId = null }) => {
    try {
        // 1. Save to MongoDB so it shows up in the App's Notification Center
        const newNotification = new Notification({
            userId,
            title,
            body,
            type,
            relatedId
        });
        await newNotification.save();

        // 2. Fetch the user's Expo Push Token from the database
        const user = await User.findById(userId);
        
        // 3. If they have a push token, send it to Expo's servers!
        if (user && user.pushToken) {
            console.log(`📡 Sending physical push to Expo for ${user.name || 'User'}...`);
            console.log(`   -> Target Token: ${user.pushToken}`);

            const message = {
                to: user.pushToken,
                sound: 'default', // Wakes up the phone and makes the ping sound
                title: title,
                body: body,
                data: { type, relatedId }, // Hidden data the app can use when the user taps it
            };

            // Ping the Official Expo Push Notification Server using native fetch
            const response = await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Accept-encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(message),
            });

            // Read the exact receipt from Expo
            const receipt = await response.json();
            console.log("📨 Expo Server Response:", JSON.stringify(receipt, null, 2));

        } else {
            console.log(`🔕 User ${userId} does not have a pushToken saved. Skipping physical push.`);
        }
        
        return newNotification;
    } catch (error) {
        console.error("❌ Error in sendNotification util:", error);
    }
};

module.exports = { sendNotification };