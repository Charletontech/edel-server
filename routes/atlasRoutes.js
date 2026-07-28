const express = require('express');
const router = express.Router();
const {
  initiateAccessFeeCheckout,
  verifyAccessFeeCheckout,
  handleAtlasWebhook
} = require('../controllers/atlasController');
const { protect } = require('../middleware/authMiddleware');

router.post('/checkout/access-fee', protect, initiateAccessFeeCheckout);
router.get('/checkout/access-fee/verify/:sourceReference', protect, verifyAccessFeeCheckout);
router.post('/webhook', handleAtlasWebhook);

module.exports = router;
