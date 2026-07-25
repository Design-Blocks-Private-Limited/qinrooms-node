const User = require('../models/User');
const Transaction = require('../models/Transaction');

const getWalletData = async (req, res) => {
    try {
        const user = await User.findById(req.user.uid);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const transactions = await Transaction.find({ userId: req.user.uid })
            .sort({ createdAt: -1 })
            .limit(50); // Get latest 50 transactions

        res.json({
            balance: user.walletBalance || 0,
            transactions: transactions.map(t => ({
                id: t._id,
                amount: t.amount,
                type: t.type,
                description: t.description,
                bookingId: t.bookingId,
                date: t.createdAt
            }))
        });
    } catch (error) {
        console.error("Wallet data fetch error:", error);
        res.status(500).json({ error: 'Failed to fetch wallet data' });
    }
};

const mongoose = require('mongoose');
const WithdrawalRequest = require('../models/WithdrawalRequest');

const requestWithdrawal = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const user = await User.findById(req.user.uid).session(session);
        if (!user) throw new Error('User not found');

        const { bankName, accountName, accountNumber, ifsc, bankDocumentUrl } = req.body;
        
        let finalBankName = bankName || user.bankDetails?.bankName;
        let finalName = accountName || user.bankDetails?.accountName;
        let finalNumber = accountNumber || user.bankDetails?.accountNumber;
        let finalIfsc = ifsc || user.bankDetails?.ifsc;
        let finalDoc = bankDocumentUrl || user.bankDetails?.bankDocumentUrl;

        if (!finalBankName || !finalName || !finalNumber || !finalIfsc || !finalDoc) {
            throw new Error('All bank details including document picture are required');
        }

        const amountToWithdraw = user.walletBalance || 0;
        
        if (amountToWithdraw <= 0) {
            throw new Error('Insufficient wallet balance to withdraw');
        }

        // Deduct from wallet
        user.walletBalance = 0; // Assuming withdraw all logic
        await user.save({ session });

        // Create withdrawal request
        const withdrawalReq = await WithdrawalRequest.create([{
            userId: req.user.uid,
            amount: amountToWithdraw,
            bankName: finalBankName,
            accountName: finalName,
            accountNumber: finalNumber,
            ifsc: finalIfsc,
            bankDocumentUrl: finalDoc
        }], { session });

        // Create transaction history
        await Transaction.create([{
            userId: req.user.uid,
            amount: amountToWithdraw,
            type: 'debit',
            description: 'Bank Withdrawal Request',
            withdrawalId: withdrawalReq[0]._id
        }], { session });

        await session.commitTransaction();
        res.status(201).json({ message: 'Withdrawal requested successfully', newBalance: 0 });
    } catch (error) {
        await session.abortTransaction();
        console.error("Withdrawal error:", error);
        res.status(400).json({ error: error.message || 'Failed to request withdrawal' });
    } finally {
        session.endSession();
    }
};

const getBankDetails = async (req, res) => {
    try {
        const user = await User.findById(req.user.uid);
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        res.json(user.bankDetails || null);
    } catch (error) {
        console.error("Get bank details error:", error);
        res.status(500).json({ error: 'Failed to fetch bank details' });
    }
};

const updateBankDetails = async (req, res) => {
    try {
        const { bankName, accountName, accountNumber, ifsc, bankDocumentUrl } = req.body;
        
        const user = await User.findByIdAndUpdate(
            req.user.uid,
            { 
                $set: { 
                    bankDetails: {
                        bankName,
                        accountName,
                        accountNumber,
                        ifsc,
                        bankDocumentUrl
                    } 
                } 
            },
            { new: true, returnDocument: 'after' }
        );
        
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        res.json(user.bankDetails);
    } catch (error) {
        console.error("Update bank details error:", error);
        res.status(500).json({ error: 'Failed to update bank details' });
    }
};

const Booking = require('../models/Booking');

const getTransactionDetails = async (req, res) => {
    try {
        const transaction = await Transaction.findOne({ _id: req.params.id, userId: req.user.uid });
        if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
        
        let details = {
            id: transaction._id,
            amount: transaction.amount,
            type: transaction.type,
            description: transaction.description,
            date: transaction.createdAt
        };

        if (transaction.bookingId) {
            const booking = await Booking.findById(transaction.bookingId);
            if (booking) {
                details.booking = {
                    title: booking.title,
                    image: booking.image,
                    checkInDate: booking.checkInDate,
                    checkOutDate: booking.checkOutDate,
                    checkedInAt: booking.checkedInAt,
                    status: booking.status,
                    bookerName: booking.bookerName
                };
                
                // Fetch guest mobile number
                const guestUser = await User.findById(booking.bookerId);
                if (guestUser) {
                    details.booking.guestMobile = guestUser.phoneNumber;
                }
            }
        } else if (transaction.withdrawalId) {
            const withdrawalReq = await WithdrawalRequest.findById(transaction.withdrawalId);
            if (withdrawalReq) {
                details.withdrawal = {
                    status: withdrawalReq.status, // 'pending', 'completed', 'rejected'
                    bankName: withdrawalReq.bankName,
                    accountName: withdrawalReq.accountName,
                    accountNumber: withdrawalReq.accountNumber,
                    ifsc: withdrawalReq.ifsc
                };
            }
        }
        
        res.json(details);
    } catch (error) {
        console.error("Transaction details error:", error);
        res.status(500).json({ error: 'Failed to fetch transaction details' });
    }
};

module.exports = {
    getWalletData,
    requestWithdrawal,
    getBankDetails,
    updateBankDetails,
    getTransactionDetails
};
