const express = require('express');
const router = express.Router();
const {
  getDashboard,
  updateStatus,
  updatePreferences,
  updatePassword,
  deleteAccount,
  updateProfile,
  upgradeAccount,
  updateLocation,
  updateProfilePhoto,
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.get('/dashboard', protect, getDashboard);
router.post('/upgrade', protect, upgradeAccount);
router.put('/location', protect, updateLocation);
router.put('/status', protect, updateStatus);
router.put('/profile', protect, updateProfile);
router.put('/profile/photo', protect, upload.single('profilePhoto'), updateProfilePhoto);
router.put('/preferences', protect, updatePreferences);
router.put('/password', protect, updatePassword);
router.delete('/', protect, deleteAccount);

module.exports = router;
