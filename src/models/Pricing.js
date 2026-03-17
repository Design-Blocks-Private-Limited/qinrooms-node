const mongoose = require('mongoose');

const pricingSchema = new mongoose.Schema({
  configId: { type: String, default: "global_pricing", unique: true }, // 🛡️ Forces uniqueness
  platformFee: { type: Number, default: 12 }, 
  gst: { type: Number, default: 5 },          
  sgst: { type: Number, default: 2.5 },       
  cgst: { type: Number, default: 2.5 }        
}, { timestamps: true });

module.exports = mongoose.model('Pricing', pricingSchema);