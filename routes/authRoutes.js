const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  verifyEmail,
  resendVerificationEmail,
  forgotPassword,
  resetPassword,
  uploadFacePhoto
} = require('../controllers/authController');
const upload = require('../middleware/uploadMiddleware');

router.post('/signup', upload.single('profilePhoto'), registerUser);
router.post('/login', loginUser);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerificationEmail);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/upload-face', upload.single('facePhoto'), uploadFacePhoto);

module.exports = router;
