require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const db = mongoose.connection.collection('users');
  const admins = await db.find({ phoneNumber: { $regex: '^admin-' } }).toArray();
  for (const admin of admins) {
    const newPhone = admin.phoneNumber.replace('admin-', '');
    await db.updateOne({ _id: admin._id }, { $set: { phoneNumber: newPhone } });
    console.log(`Updated ${admin.email}: ${admin.phoneNumber} -> ${newPhone}`);
  }
  console.log('Done.');
  process.exit(0);
});
