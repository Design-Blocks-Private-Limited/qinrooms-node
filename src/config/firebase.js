const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // Your downloaded key

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

module.exports = admin;