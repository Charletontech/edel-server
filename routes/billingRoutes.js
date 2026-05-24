const express = require('express');
const router = express.Router();
const {
  getBillingStatus,
  initializePayment,
  verifyPayment,
  getTransactions
} = require('../controllers/billingController');
const { protect } = require('../middleware/authMiddleware');

router.get('/status', protect, getBillingStatus);
router.post('/paystack/initialize', protect, initializePayment);
router.get('/paystack/verify/:reference', protect, verifyPayment);
router.get('/transactions', protect, getTransactions);

module.exports = router;
