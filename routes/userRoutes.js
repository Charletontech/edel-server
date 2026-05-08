const express = require('express');
const router = express.Router();
const { getDashboard, updateStatus, updatePreferences, updatePassword, deleteAccount, updateProfile, upgradeAccount, updateLocation } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

router.get('/dashboard', protect, getDashboard);
router.post('/upgrade', protect, upgradeAccount);
router.put('/location', protect, updateLocation);
router.put('/status', protect, updateStatus);
router.put('/profile', protect, updateProfile);
router.put('/preferences', protect, updatePreferences);
router.put('/password', protect, updatePassword);
router.delete('/', protect, deleteAccount);

module.exports = router;
