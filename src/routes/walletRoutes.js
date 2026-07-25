const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/authMiddleware');
const { getWalletData, requestWithdrawal, getBankDetails, updateBankDetails } = require('../controllers/walletController');

// GET: Fetch Wallet Balance and Transactions
router.get('/', requireAuth, getWalletData);

// POST: Request Withdrawal
router.post('/withdraw', requireAuth, requestWithdrawal);

// GET/PUT: Bank Details
router.get('/bank-details', requireAuth, getBankDetails);
router.put('/bank-details', requireAuth, updateBankDetails);

// GET: Transaction Details
router.get('/transactions/:id', requireAuth, require('../controllers/walletController').getTransactionDetails);

module.exports = router;
