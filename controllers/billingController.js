const { User, Transaction, PlatformSetting } = require('../models');
const { getPlatformSettingValue } = require('../utils/platformSettings');
const https = require('https');

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// @desc    Get user billing status
// @route   GET /api/billing/status
// @access  Private (Provider)
exports.getBillingStatus = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const freeLimit = await getPlatformSettingValue('provider_free_order_limit') || 3;
    const accessFeeAmount = await getPlatformSettingValue('provider_access_fee_amount') || 3500;

    res.json({
      jobsCompleted: user.jobsCompleted,
      hasPaidAccessFee: user.hasPaidAccessFee,
      freeOrdersLimit: freeLimit,
      accessFeeAmount: accessFeeAmount,
      requiresPayment: user.jobsCompleted >= freeLimit && !user.hasPaidAccessFee,
      paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Initialize Paystack Payment
// @route   POST /api/billing/paystack/initialize
// @access  Private (Provider)
exports.initializePayment = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    
    if (user.hasPaidAccessFee) {
      return res.status(400).json({ message: 'You have already paid the access fee.' });
    }

    const amount = await getPlatformSettingValue('provider_access_fee_amount') || 3500;

    const params = JSON.stringify({
      email: user.email,
      amount: amount * 100, // Paystack amount is in kobo
      metadata: {
        userId: user.id,
        custom_fields: [
          {
            display_name: "Fee Type",
            variable_name: "fee_type",
            value: "Platform Access Fee"
          }
        ]
      }
    });

    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: '/transaction/initialize',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    const paystackReq = https.request(options, paystackRes => {
      let data = '';

      paystackRes.on('data', (chunk) => {
        data += chunk;
      });

      paystackRes.on('end', async () => {
        const responseData = JSON.parse(data);
        if (responseData.status) {
          // Record pending transaction
          await Transaction.create({
            userId: user.id,
            reference: responseData.data.reference,
            amount: amount,
            status: 'pending',
            description: 'Platform Access Fee'
          });

          res.json({
            authorization_url: responseData.data.authorization_url,
            access_code: responseData.data.access_code,
            reference: responseData.data.reference
          });
        } else {
          res.status(400).json({ message: responseData.message || 'Payment initialization failed' });
        }
      });
    }).on('error', error => {
      next(error);
    });

    paystackReq.write(params);
    paystackReq.end();
  } catch (error) {
    next(error);
  }
};

// @desc    Verify Paystack Payment
// @route   GET /api/billing/paystack/verify/:reference
// @access  Private (Provider)
exports.verifyPayment = async (req, res, next) => {
  try {
    const reference = req.params.reference;

    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: `/transaction/verify/${encodeURIComponent(reference)}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
      }
    };

    https.request(options, paystackRes => {
      let data = '';

      paystackRes.on('data', (chunk) => {
        data += chunk;
      });

      paystackRes.on('end', async () => {
        const responseData = JSON.parse(data);
        if (responseData.status && responseData.data.status === 'success') {
          // Find transaction
          const transaction = await Transaction.findOne({ where: { reference } });
          if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found' });
          }

          if (transaction.status === 'success') {
            return res.json({ message: 'Payment already verified', transaction });
          }

          // Update transaction
          transaction.status = 'success';
          transaction.paidAt = new Date();
          await transaction.save();

          // Update user
          const user = await User.findByPk(transaction.userId);
          if (user) {
            user.hasPaidAccessFee = true;
            await user.save();
          }

          res.json({ message: 'Payment verified successfully', transaction });
        } else {
          // Find transaction and mark failed
          const transaction = await Transaction.findOne({ where: { reference } });
          if (transaction && transaction.status === 'pending') {
            transaction.status = 'failed';
            await transaction.save();
          }
          res.status(400).json({ message: 'Payment verification failed or pending', data: responseData.data });
        }
      });
    }).on('error', error => {
      next(error);
    }).end();
  } catch (error) {
    next(error);
  }
};

// @desc    Get user transactions
// @route   GET /api/billing/transactions
// @access  Private
exports.getTransactions = async (req, res, next) => {
  try {
    const transactions = await Transaction.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']]
    });

    res.json(transactions);
  } catch (error) {
    next(error);
  }
};
