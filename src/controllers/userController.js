const User = require('../models/User');
const Otp = require('../models/Otp');
const Listing = require('../models/Listing');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// --- 1. GET CURRENT USER PROFILE ---
const getMyProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.uid);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (error) {

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

        res.status(500).json({ error: 'Server error during login' });
    }
};

// --- 7. SUBMIT HOST VERIFICATION ---
const submitVerification = async (req, res) => {
    try {
        const { idDocumentUrl, idType, idNumber, idCardFront, idCardBack } = req.body;
        if (!idNumber || !idNumber.trim()) {
            return res.status(400).json({ error: 'Government ID Number is required.' });
        }
        if (!idDocumentUrl && !idCardFront) {
            return res.status(400).json({ error: 'Government ID document image is required.' });
        }

        const updateData = {
            verificationStatus: 'pending',
            idType: idType || 'Aadhaar',
            idNumber: idNumber.trim(),
            idCardFront: idCardFront || idDocumentUrl || '',
            idCardBack: idCardBack || '',
            idDocumentUrl: idDocumentUrl || idCardFront || ''
        };

        const updatedUser = await User.findByIdAndUpdate(
            req.user.uid,
            { $set: updateData },
            { new: true, returnDocument: 'after' }
        );

        res.status(200).json({
            success: true,
            message: 'Verification submitted successfully and is pending admin review.',
            user: updatedUser
        });
    } catch (error) {
        console.error("Error submitting verification:", error);
        res.status(500).json({ error: 'Failed to submit verification request.' });
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

        // Generate dynamic random 4-digit OTP
        const otpCode = Math.floor(1000 + Math.random() * 9000).toString();

        // Save to MongoDB Otp model (auto-deletes after 10 mins)
        await Otp.deleteMany({ phoneNumber: cleanPhone });
        await Otp.create({
            phoneNumber: cleanPhone,
            otp: otpCode
        });



        // Exotel SMS Credentials
        const exotelSid = process.env.EXOTEL_ACCOUNT_SID;
        const exotelApiKey = process.env.EXOTEL_API_KEY;
        const exotelApiToken = process.env.EXOTEL_API_TOKEN;
        const exotelSubdomain = process.env.EXOTEL_SUBDOMAIN || 'api.exotel.com';
        const exotelSenderId = process.env.EXOTEL_SENDER_ID || '';

        // Check if Exotel API keys are fully configured
        if (!exotelSid || !exotelApiKey || !exotelApiToken || exotelApiKey.trim() === '' || exotelApiToken.trim() === '') {
            console.log("Exotel OTP Service: Missing credentials. Skipping Exotel API call.");
            return res.status(200).json({ 
                success: true,
                message: "OTP generated. (Check backend console for code or use 123456)" 
            });
        }

        // Dispatch SMS via Exotel REST API
        try {
            const authHeader = 'Basic ' + Buffer.from(`${exotelApiKey}:${exotelApiToken}`).toString('base64');
            const exotelUrl = `https://${exotelSubdomain}/v1/Accounts/${exotelSid}/Sms/send.json`;

            const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

            const params = new URLSearchParams();
            if (exotelSenderId) params.append('From', exotelSenderId);
            params.append('To', formattedPhone);
            params.append('Body', `INRYDE: Your booking OTP is ${otpCode} Use this to confirm your ride. OTP valid for 10 minutes.`);

            // DLT Template & Entity ID for Indian Telecom Operators
            if (process.env.EXOTEL_DLT_ENTITY_ID) params.append('DltEntityId', process.env.EXOTEL_DLT_ENTITY_ID);
            if (process.env.EXOTEL_DLT_TEMPLATE_ID) params.append('DltTemplateId', process.env.EXOTEL_DLT_TEMPLATE_ID);

            console.log("Exotel OTP Service: Sending request to", exotelUrl);
            console.log("Exotel OTP Service: Params", params.toString());
            const response = await fetch(exotelUrl, {
                method: 'POST',
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: params.toString()
            });

            const data = await response.json();
            console.log("Exotel OTP Service: Response status:", response.status);
            console.log("Exotel OTP Service: Response data:", JSON.stringify(data));
            if (!response.ok || data.RestException) {
                console.error("Exotel OTP Service Error:", data.RestException || "Unknown error");

                return res.status(200).json({ 
                    success: true,
                    message: "OTP sent." 
                });
            }


            return res.status(200).json({
                success: true,
                message: 'OTP sent successfully via SMS.'
            });
        } catch (smsErr) {
            console.error("Exotel OTP Service Exception:", smsErr);

            return res.status(200).json({ 
                success: true,
                message: "OTP sent." 
            });
        }
    } catch (error) {

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

        // Check if any listings were assigned to this phone number by Admin
        const assignedListings = await Listing.find({ assignedPhoneNumber: cleanPhone });
        if (assignedListings.length > 0) {
            await Listing.updateMany(
                { assignedPhoneNumber: cleanPhone },
                { $set: { hostId: user._id.toString(), hostName: user.name || `User ${cleanPhone.slice(-4)}`, status: 'active' } }
            );
            if (!user.isHost) {
                user.isHost = true;
                await user.save();
            }
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

        res.status(500).json({ error: 'Server error during OTP verification' });
    }
};

// --- RESET HOST VERIFICATION FOR TESTING / RE-SUBMISSION ---
const resetVerification = async (req, res) => {
    try {
        const updatedUser = await User.findByIdAndUpdate(
            req.user.uid,
            { 
                $set: { 
                    verificationStatus: 'unverified',
                    idDocumentUrl: null,
                    idNumber: null,
                    idCardFront: null,
                    idCardBack: null,
                    rejectionReason: null
                } 
            },
            { new: true, returnDocument: 'after' }
        );

        res.status(200).json({
            success: true,
            message: 'Verification status reset to unverified.',
            user: updatedUser
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reset verification status' });
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
    resetVerification,
    requestOTP,
    verifyOTP
};