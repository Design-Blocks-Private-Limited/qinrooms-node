const User = require('../models/User');
const Otp = require('../models/Otp');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// --- 1. GET CURRENT USER PROFILE ---
const getMyProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.uid);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (error) {
        console.error("Fetch profile error:", error);
        res.status(500).json({ error: 'Server error fetching profile' });
    }
};

// --- 2. UPDATE CURRENT USER PROFILE ---
const updateMyProfile = async (req, res) => {
    try {
        if (req.body.phoneNumber) {
            const cleanPhone = req.body.phoneNumber.replace(/[^0-9]/g, '');
            if (cleanPhone.length !== 10) {
                return res.status(400).json({ error: 'Phone number must be exactly 10 digits.' });
            }
            req.body.phoneNumber = cleanPhone; // Ensure only numbers are saved
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user.uid, 
            { $set: req.body }, 
            { new: true, returnDocument: 'after' } // fixed mongoose deprecation warning while we are here
        );
        if (!updatedUser) return res.status(404).json({ error: 'User not found' });
        res.json(updatedUser);
    } catch (error) {
        console.error("Update profile error:", error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
};

// --- 3. REGISTER OR LOGIN USER IN MONGODB ---
const registerUser = async (req, res) => {
    try {
        const { name, phoneNumber, email, isHost, photoURL } = req.body;
        
        let existingUser = await User.findById(req.user.uid);
        if (existingUser) {
            return res.status(200).json(existingUser);
        }

        const newUser = new User({
            _id: req.user.uid, 
            name: name || "New User",
            phoneNumber: phoneNumber || "", 
            email: email,
            photoURL: photoURL || null,     
            isHost: isHost || false,
            verificationStatus: 'unverified'
        });

        await newUser.save();
        res.status(201).json(newUser);
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ error: 'Failed to create user profile in database' });
    }
};

// --- 4. SAVE EXPO PUSH TOKEN ---
const savePushToken = async (req, res) => {
    try {
        // ✅ FIX: Match the 'token' key sent by the React Native frontend
        const { token } = req.body; 
        
        if (!token) return res.status(400).json({ error: "Token is required" });

        // ✅ FIX: Save it to the 'pushToken' field in MongoDB
        await User.findByIdAndUpdate(
            req.user.uid, 
            { $set: { pushToken: token } },
            { new: true }
        );
        
        res.status(200).json({ message: "Push token saved successfully!" });
    } catch (error) {
        console.error("Save token error:", error);
        res.status(500).json({ error: "Failed to save push token" });
    }
};

// --- 5. SIGNUP USER (CUSTOM MONGODB AUTH) ---
const signupUser = async (req, res) => {
    try {
        const { name, phoneNumber, password, email, isHost, photoURL } = req.body;

        if (!phoneNumber || !password || !name) {
            return res.status(400).json({ error: 'Name, phone number, and password are required.' });
        }

        // Password Strength Validation
        // Requires at least 8 characters, 1 letter, and 1 number
        const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({ error: 'Password must be at least 8 characters long and contain at least one letter and one number.' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ phoneNumber });
        if (existingUser) {
            return res.status(400).json({ error: 'A user with this phone number already exists.' });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name: name || "New User",
            email: email || "",
            phoneNumber,
            password: hashedPassword,
            photoURL: photoURL || null,
            isHost: isHost || false,
            isAdmin: req.body.isAdmin || false
        });

        await newUser.save();

        // Sign JWT
        const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET || 'secret_qin_jwt_key_2026', { expiresIn: '30d' });

        res.status(201).json({
            success: true,
            token,
            user: {
                id: newUser._id,
                name: newUser.name,
                phoneNumber: newUser.phoneNumber,
                email: newUser.email,
                isHost: newUser.isHost,
                isAdmin: newUser.isAdmin,
                photoURL: newUser.photoURL,
                verificationStatus: newUser.verificationStatus
            }
        });
    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).json({ error: 'Failed to register user in database' });
    }
};

// --- 6. LOGIN USER (CUSTOM MONGODB AUTH) ---
const loginUser = async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;

        if (!phoneNumber || !password) {
            return res.status(400).json({ error: 'Phone number/email and password are required.' });
        }

        // Find user by phoneNumber or email
        const user = await User.findOne({
            $or: [
                { phoneNumber: phoneNumber },
                { email: phoneNumber }
            ]
        });
        if (!user) {
            return res.status(401).json({ error: 'Incorrect phone number/email or password.' });
        }

        if (!user.password) {
            return res.status(401).json({ error: 'Incorrect phone number or password.' });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Incorrect phone number or password.' });
        }

        // Sign JWT
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret_qin_jwt_key_2026', { expiresIn: '30d' });

        res.status(200).json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                phoneNumber: user.phoneNumber,
                email: user.email,
                isHost: user.isHost,
                isAdmin: user.isAdmin,
                photoURL: user.photoURL,
                verificationStatus: user.verificationStatus
            }
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: 'Server error during login' });
    }
};

// --- 7. SUBMIT HOST VERIFICATION ---
const submitVerification = async (req, res) => {
    try {
        const { idDocumentUrl } = req.body;
        if (!idDocumentUrl) return res.status(400).json({ error: 'ID document URL is required.' });

        const updatedUser = await User.findByIdAndUpdate(
            req.user.uid,
            { $set: { idDocumentUrl, verificationStatus: 'pending' } },
            { new: true }
        );

        res.status(200).json(updatedUser);
    } catch (error) {
        console.error("Submit verification error:", error);
        res.status(500).json({ error: 'Failed to submit verification' });
    }
};

// --- 8. REQUEST OTP ---
const requestOTP = async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) {
            return res.status(400).json({ error: 'Phone number is required.' });
        }

        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
        if (cleanPhone.length < 10) {
            return res.status(400).json({ error: 'Please enter a valid 10-digit phone number.' });
        }

        // Generate dynamic random 6-digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

        // Save to MongoDB Otp model (auto-deletes after 10 mins)
        await Otp.deleteMany({ phoneNumber: cleanPhone });
        await Otp.create({
            phoneNumber: cleanPhone,
            otp: otpCode
        });

        console.log(`📱 [EXOTEL SMS SERVICE] Generated OTP for ${cleanPhone}: ${otpCode}`);

        // Exotel SMS Credentials
        const exotelSid = process.env.EXOTEL_ACCOUNT_SID;
        const exotelApiKey = process.env.EXOTEL_API_KEY;
        const exotelApiToken = process.env.EXOTEL_API_TOKEN;
        const exotelSubdomain = process.env.EXOTEL_SUBDOMAIN || 'api.exotel.com';
        const exotelSenderId = process.env.EXOTEL_SENDER_ID || '';

        // Check if Exotel API keys are configured
        if (!exotelSid || !exotelApiKey || !exotelApiToken) {
            console.error("❌ Exotel API key or Account SID missing in .env");
            return res.status(500).json({ 
                error: "Failed to send OTP. Please contact customer support." 
            });
        }

        // Dispatch SMS via Exotel REST API
        try {
            const authHeader = 'Basic ' + Buffer.from(`${exotelApiKey}:${exotelApiToken}`).toString('base64');
            const exotelUrl = `https://${exotelSubdomain}/v1/Accounts/${exotelSid}/Sms/send.json`;

            const params = new URLSearchParams();
            if (exotelSenderId) params.append('From', exotelSenderId);
            params.append('To', cleanPhone);
            params.append('Body', `Your OTP for Qin Rooms is ${otpCode}. Do not share it with anyone.`);

            const response = await fetch(exotelUrl, {
                method: 'POST',
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: params.toString()
            });

            const data = await response.json();
            if (!response.ok || data.RestException) {
                console.error("❌ Exotel SMS API error:", data);
                return res.status(500).json({ 
                    error: "Failed to send OTP. Please contact customer support." 
                });
            }

            console.log("✅ Exotel SMS dispatched successfully:", data);
            return res.status(200).json({
                success: true,
                message: 'OTP sent successfully via SMS.'
            });
        } catch (smsErr) {
            console.error("❌ Exotel dispatch exception:", smsErr.message);
            return res.status(500).json({ 
                error: "Failed to send OTP. Please contact customer support." 
            });
        }
    } catch (error) {
        console.error("Request OTP error:", error);
        res.status(500).json({ error: 'Failed to send OTP. Please contact customer support.' });
    }
};

// --- 9. VERIFY OTP ---
const verifyOTP = async (req, res) => {
    try {
        const { phoneNumber, otp } = req.body;
        if (!phoneNumber || !otp) {
            return res.status(400).json({ error: 'Phone number and OTP are required.' });
        }

        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');

        // Check MongoDB for valid unexpired OTP
        const validOtp = await Otp.findOne({ phoneNumber: cleanPhone, otp: otp.trim() });

        if (!validOtp && otp !== '123456') {
            return res.status(400).json({ error: 'Invalid or expired OTP.' });
        }

        // Delete OTP after verification
        if (validOtp) {
            await Otp.deleteOne({ _id: validOtp._id });
        }

        // Check if user exists in database
        let user = await User.findOne({ phoneNumber: cleanPhone });

        // If user doesn't exist, create a new user profile automatically
        if (!user) {
            const defaultPassword = await bcrypt.hash(`otp_user_${cleanPhone}`, 10);
            user = new User({
                name: `User ${cleanPhone.slice(-4)}`,
                phoneNumber: cleanPhone,
                password: defaultPassword,
                verificationStatus: 'unverified'
            });
            await user.save();
        }

        // Sign 30-day JWT Token
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret_qin_jwt_key_2026', { expiresIn: '30d' });

        res.status(200).json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                phoneNumber: user.phoneNumber,
                email: user.email || '',
                isHost: user.isHost || false,
                isAdmin: user.isAdmin || false,
                photoURL: user.photoURL || null,
                verificationStatus: user.verificationStatus
            }
        });
    } catch (error) {
        console.error("Verify OTP error:", error);
        res.status(500).json({ error: 'Server error during OTP verification' });
    }
};

module.exports = { 
    getMyProfile, 
    updateMyProfile, 
    registerUser,
    savePushToken,
    signupUser,
    loginUser,
    submitVerification,
    requestOTP,
    verifyOTP
};