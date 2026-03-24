const Notification = require('../models/Notification');
const User = require('../models/User');
const axios = require('axios'); // You might need to run: npm install axios

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
            const message = {
                to: user.pushToken,
                sound: 'default',
                title: title,
                body: body,
                data: { type, relatedId }, // Secret data the app can use when the user taps the notification
            };

            await axios.post('https://exp.host/--/api/v2/push/send', message, {
                headers: {
                    'Accept': 'application/json',
                    'Accept-encoding': 'application/json',
                    'Content-Type': 'application/json',
                }
            });
            console.log(`Push sent to ${user.name}: ${title}`);
        }
        
        return newNotification;
    } catch (error) {
        console.error("Error sending notification:", error.message);
    }
};

module.exports = { sendNotification };