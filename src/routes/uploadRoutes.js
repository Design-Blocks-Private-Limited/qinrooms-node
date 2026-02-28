// src/routes/uploadRoutes.js
const express = require('express');
const router = express.Router();
const cloudinary = require('cloudinary').v2;
const { requireAuth } = require('../middlewares/authMiddleware');

// Configure Cloudinary using your Environment Variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// GET: Generate a secure signature for direct-to-cloud mobile uploads
router.get('/signature', requireAuth, (req, res) => {
    try {
        const timestamp = Math.round((new Date).getTime() / 1000);
        
        // We use the SDK to generate a cryptographic hash using your secret key
        const signature = cloudinary.utils.api_sign_request(
            { timestamp: timestamp },
            process.env.CLOUDINARY_API_SECRET
        );

        res.json({
            signature,
            timestamp,
            apiKey: process.env.CLOUDINARY_API_KEY,
            cloudName: process.env.CLOUDINARY_CLOUD_NAME
        });
    } catch (error) {
        console.error("Signature generation error:", error);
        res.status(500).json({ error: "Failed to generate upload signature" });
    }
});

module.exports = router;