const Razorpay = require("razorpay");
const crypto = require("crypto");

// Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET,
});

exports.createOrder = async (req, res) => {
  try {
    const { amount } = req.body;
    const numericAmount = Number(amount);
    if (!amount || isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    const options = {
      amount: Math.round(numericAmount * 100), // amount in the smallest currency unit (paise) must be an integer
      currency: "INR",
      receipt: `receipt_order_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    if (!order) {
      return res.status(500).json({ error: "Some error occurred creating order" });
    }

    res.json({ ...order, key_id: process.env.RAZORPAY_KEY_ID });
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    res.status(500).json({ error: error.message || error.description || "Error creating Razorpay order" });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET)
      .update(body.toString())
      .digest("hex");

    const isAuthentic = expectedSignature === razorpay_signature;

    if (isAuthentic) {
      // Here you would typically mark the booking as paid in your DB if you passed a booking ID
      res.json({ success: true, message: "Payment verified successfully" });
    } else {
      res.status(400).json({ success: false, error: "Invalid signature" });
    }
  } catch (error) {

    res.status(500).json({ error: "Error verifying payment" });
  }
};

const bookingController = require('./bookingController');

exports.verifyAndBook = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    // Verify Payment Signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET)
      .update(body.toString())
      .digest("hex");

    const isAuthentic = expectedSignature === razorpay_signature;

    if (!isAuthentic) {
      return res.status(400).json({ success: false, error: "Invalid payment signature. Booking aborted." });
    }

    // Payment is valid! Let's pass it off to createBooking
    try {
      return await bookingController.createBooking(req, res);
    } catch (bookingError) {
      // Race Condition / Double Booking Handler: Auto-refund the second payment!
      if (razorpay_payment_id) {
        try {
          const refundAmount = req.body.totalPrice;
          await exports.processRefund(razorpay_payment_id, refundAmount);
          return res.status(400).json({ 
            error: "Dates were just booked by someone else! Your payment has been automatically refunded." 
          });
        } catch (refundError) {
          console.error("Auto refund error:", refundError);
          return res.status(400).json({ 
            error: "Dates were just booked by someone else. Please contact support for payment refund." 
          });
        }
      }
      throw bookingError;
    }

  } catch (error) {
    res.status(500).json({ error: "Error during verified booking creation" });
  }
};

exports.processRefund = async (paymentId, amount) => {
  try {
    // Amount should be in paise
    const refund = await razorpay.payments.refund(paymentId, { amount: Math.round(amount * 100) });
    return refund;
  } catch (error) {

    throw error;
  }
};

