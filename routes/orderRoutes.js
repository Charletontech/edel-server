const express = require('express');
const router = express.Router();
const {
  createOrder,
  getActivityOrders,
  acceptOrder,
  declineOrder,
  cancelOrder,
  reportOrder
} = require('../controllers/orderController');
const { startSession, verifySession } = require('../controllers/verificationController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/activity', getActivityOrders);
router.post('/', createOrder);
router.post('/start-session', startSession);
router.post('/verify-session', verifySession);
router.post('/:id/accept', acceptOrder);
router.post('/:id/decline', declineOrder);
router.post('/:id/cancel', cancelOrder);
router.post('/:id/report', reportOrder);

module.exports = router;
