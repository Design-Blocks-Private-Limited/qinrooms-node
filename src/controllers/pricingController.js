const Pricing = require('../models/Pricing');

// GET Global Pricing
exports.getPricing = async (req, res) => {
  try {
    let pricing = await Pricing.findOne({ configId: "global_pricing" });
    
    if (!pricing) {
      pricing = await Pricing.create({
        configId: "global_pricing",
        platformFee: 12,
        gst: 5,
        sgst: 2.5,
        cgst: 2.5
      });
    }
    res.status(200).json(pricing);
  } catch (error) {

    res.status(500).json({ message: "Server error fetching pricing data." });
  }
};

// UPDATE Global Pricing
exports.updatePricing = async (req, res) => {
  try {
    const { platformFee, gst, sgst, cgst } = req.body;
    
    // 🛡️ STRICT VALIDATION: Prevents negative or absurdly high fees
    const isValidPercentage = (val) => typeof val === 'number' && val >= 0 && val <= 100;
    
    if (![platformFee, gst, sgst, cgst].every(isValidPercentage)) {
        return res.status(400).json({ message: "Invalid pricing values. Must be a number between 0 and 100." });
    }

    let pricing = await Pricing.findOne({ configId: "global_pricing" });
    if (!pricing) {
      pricing = new Pricing({ configId: "global_pricing" });
    }

    pricing.platformFee = platformFee;
    pricing.gst = gst;
    pricing.sgst = sgst;
    pricing.cgst = cgst;

    await pricing.save();

    res.status(200).json({ message: "Pricing updated successfully", pricing });
  } catch (error) {

    res.status(500).json({ message: "Server error updating pricing data." });
  }
};