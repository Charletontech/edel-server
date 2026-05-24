const express = require('express');
const router = express.Router();
const {
  getDashboard,
  getUsers,
  getUserDetail,
  suspendUser,
  restoreUser,
  makeAdmin,
  getOrders,
  getOrderDetail,
  getReports,
  getReportDetail,
  reviewReport,
  disableService,
  restoreService,
  getSettings,
  updateSettings
} = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.use(protect, adminOnly);

router.get('/dashboard', getDashboard);
router.get('/users', getUsers);
router.get('/users/:id', getUserDetail);
router.post('/users/:id/suspend', suspendUser);
router.post('/users/:id/restore', restoreUser);
router.post('/users/:id/make-admin', makeAdmin);
router.get('/orders', getOrders);
router.get('/orders/:id', getOrderDetail);
router.get('/reports', getReports);
router.get('/reports/:orderId', getReportDetail);
router.post('/reports/:orderId/review', reviewReport);
router.post('/services/:id/disable', disableService);
router.post('/services/:id/restore', restoreService);
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

module.exports = router;
