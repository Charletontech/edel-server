const { User } = require('../models');
const generateToken = require('../utils/generateToken');
const crypto = require('crypto');
const { sendPasswordResetEmail, sendEmailVerificationEmail } = require('../utils/mailer');

const serializeUser = (user, { includeToken = true } = {}) => ({
  id: user.id,
  fullName: user.fullName,
  email: user.email,
  phoneNumber: user.phoneNumber,
  locationLabel: user.locationLabel,
  latitude: user.latitude,
  longitude: user.longitude,
  role: user.role,
  emailVerified: user.emailVerified,
  rating: user.rating,
  tier: user.tier,
  hasPaidAccessFee: user.hasPaidAccessFee && user.accessFeeExpiresAt && new Date(user.accessFeeExpiresAt) > new Date(),
  accessFeeExpiresAt: user.accessFeeExpiresAt,
  jobsCompleted: user.jobsCompleted,
  availabilityStatus: user.availabilityStatus,
  serviceCategory: user.serviceCategory,
  serviceTitle: user.serviceTitle,
  basePrice: user.basePrice,
  serviceDescription: user.serviceDescription,
  profilePhoto: user.profilePhoto,
  facePhoto: user.facePhoto,
  faceVerified: user.faceVerified,
  accountStatus: user.accountStatus,
  token: includeToken ? generateToken(user.id) : undefined
});

const buildVerificationToken = () => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 hours

  return { rawToken, tokenHash, expiresAt };
};

const issueVerificationEmail = async (user) => {
  const { rawToken, tokenHash, expiresAt } = buildVerificationToken();
  user.emailVerificationTokenHash = tokenHash;
  user.emailVerificationExpiresAt = expiresAt;
  await user.save();

  const publicWebBaseUrl = process.env.PUBLIC_WEB_BASE_URL || 'http://localhost:5500';
  const verifyUrl = `${publicWebBaseUrl.replace(/\/$/, '')}/auth/?verify=${encodeURIComponent(rawToken)}`;

  await sendEmailVerificationEmail({
    to: user.email,
    fullName: user.fullName,
    verifyUrl
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Email Verification] User ${user.id} verification link: ${verifyUrl}`);
  }

  return verifyUrl;
};

// @desc    Register a new user
// @route   POST /api/auth/signup
// @access  Public
exports.registerUser = async (req, res, next) => {
  try {
    const {
      fullName,
      email,
      password,
      phoneNumber,
      locationLabel,
      latitude,
      longitude,
      role
    } = req.body || {};

    // Handle file upload
    let profilePhotoPath = '/assets/images/avatar.jpg'; // Default
    if (req.file) {
      profilePhotoPath = `/uploads/profiles/${req.file.filename}`;
    }

    const normalizedRole = role || 'customer';
    const normalizedEmail = email ? email.trim().toLowerCase() : '';
    const normalizedLocationLabel = locationLabel ? locationLabel.trim() : null;
    const normalizedLatitude =
      latitude === '' || latitude === null || typeof latitude === 'undefined'
        ? null
        : Number(latitude);
    const normalizedLongitude =
      longitude === '' || longitude === null || typeof longitude === 'undefined'
        ? null
        : Number(longitude);

    // Validate coordinates only when provided (they must be valid numbers)
    if (
      (normalizedLatitude !== null && Number.isNaN(normalizedLatitude)) ||
      (normalizedLongitude !== null && Number.isNaN(normalizedLongitude))
    ) {
      res.status(400);
      throw new Error('Location coordinates must be valid numbers when provided');
    }

    const userExists = await User.findOne({ where: { email: normalizedEmail } });

    if (userExists) {
      if (!userExists.emailVerified) {
        await issueVerificationEmail(userExists);
        return res.status(200).json({
          message: 'This account is waiting for email verification. We have sent a new verification link.',
          email: userExists.email,
          requiresVerification: true
        });
      }

      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Auth Debug] Duplicate signup blocked for email:', normalizedEmail, 'matched user id:', userExists.id);
      }
      res.status(400);
      throw new Error('An account with this email already exists. Sign in instead or use another email.');
    }

    const user = await User.create({
      fullName,
      email: normalizedEmail,
      password,
      phoneNumber,
      locationLabel: normalizedLocationLabel,
      latitude: normalizedLatitude,
      longitude: normalizedLongitude,
      role: normalizedRole,
      emailVerified: false,
      profilePhoto: profilePhotoPath,
    });

    if (user) {
      await issueVerificationEmail(user);

      res.status(201).json({
        message: 'Your account has been created. Please verify your email before signing in.',
        email: user.email,
        requiresVerification: true
      });
    } else {
      res.status(400);
      throw new Error('Invalid user data');
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
exports.loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = email ? email.trim().toLowerCase() : '';

    const user = await User.findOne({ where: { email: normalizedEmail } });

    if (user && (await user.matchPassword(password))) {
      if ((user.accountStatus || 'active') === 'suspended') {
        res.status(403);
        throw new Error('This account is suspended. Contact support or an administrator.');
      }

      if (user.emailVerified === false) {
        res.status(403);
        return res.json({
          message: 'Email verification required before signing in.',
          code: 'EMAIL_NOT_VERIFIED',
          email: user.email,
          requiresVerification: true
        });
      }

      res.json(serializeUser(user));
    } else {
      res.status(401);
      throw new Error('Invalid email or password');
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Request password reset
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body || {};
    const normalizedEmail = email ? email.trim().toLowerCase() : '';

    if (!normalizedEmail) {
      res.status(400);
      throw new Error('Email is required');
    }

    const user = await User.findOne({ where: { email: normalizedEmail } });

    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes

      user.passwordResetTokenHash = tokenHash;
      user.passwordResetExpiresAt = expiresAt;
      await user.save();

      const publicWebBaseUrl = process.env.PUBLIC_WEB_BASE_URL || 'http://localhost:5500';
      const resetUrl = `${publicWebBaseUrl.replace(/\/$/, '')}/change-password/?token=${encodeURIComponent(rawToken)}`;

      try {
        await sendPasswordResetEmail({
          to: user.email,
          fullName: user.fullName,
          resetUrl
        });
      } catch (mailError) {
        console.error(`[Password Reset] Failed to send reset email for user ${user.id}:`, mailError.message);

        user.passwordResetTokenHash = null;
        user.passwordResetExpiresAt = null;
        try {
          await user.save();
        } catch (cleanupError) {
          console.error(
            `[Password Reset] Failed to clear reset token after mail error for user ${user.id}:`,
            cleanupError.message
          );
        }

        res.status(500);
        throw new Error('Unable to send password reset email right now. Please try again later.');
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Password Reset] User ${user.id} reset link: ${resetUrl}`);
      }

      const response = {
        message: 'If this email exists, a password reset link has been generated.'
      };
      if (process.env.NODE_ENV !== 'production') {
        response.resetUrl = resetUrl;
      }
      return res.json(response);
    }

    return res.json({
      message: 'If this email exists, a password reset link has been generated.'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify email address
// @route   POST /api/auth/verify-email
// @access  Public
exports.verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.body || {};

    if (!token || !String(token).trim()) {
      res.status(400);
      throw new Error('Verification token is required');
    }

    const tokenHash = crypto.createHash('sha256').update(String(token).trim()).digest('hex');

    const user = await User.findOne({
      where: {
        emailVerificationTokenHash: tokenHash
      }
    });

    if (!user || !user.emailVerificationExpiresAt || user.emailVerificationExpiresAt.getTime() < Date.now()) {
      res.status(400);
      throw new Error('Verification token is invalid or has expired');
    }

    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    user.emailVerificationTokenHash = null;
    user.emailVerificationExpiresAt = null;
    await user.save();

    res.json({
      message: 'Email verified successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Resend email verification
// @route   POST /api/auth/resend-verification
// @access  Public
exports.resendVerificationEmail = async (req, res, next) => {
  try {
    const { email } = req.body || {};
    const normalizedEmail = email ? email.trim().toLowerCase() : '';

    if (!normalizedEmail) {
      res.status(400);
      throw new Error('Email is required');
    }

    const user = await User.findOne({ where: { email: normalizedEmail } });

    if (!user) {
      return res.json({
        message: 'If an account exists for that email, a verification link will be sent.'
      });
    }

    if (user.emailVerified) {
      return res.json({
        message: 'This account is already verified. You can sign in now.'
      });
    }

    await issueVerificationEmail(user);

    return res.json({
      message: 'Verification link sent. Check your inbox and spam folder.'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reset password using token
// @route   POST /api/auth/reset-password
// @access  Public
exports.resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body || {};

    if (!token || !String(token).trim()) {
      res.status(400);
      throw new Error('Reset token is required');
    }

    if (!newPassword || String(newPassword).length < 8) {
      res.status(400);
      throw new Error('New password must be at least 8 characters');
    }

    const tokenHash = crypto.createHash('sha256').update(String(token).trim()).digest('hex');

    const user = await User.findOne({
      where: {
        passwordResetTokenHash: tokenHash
      }
    });

    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt.getTime() < Date.now()) {
      res.status(400);
      throw new Error('Reset token is invalid or has expired');
    }

    user.password = String(newPassword);
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    await user.save();

    res.json({
      message: 'Password has been reset successfully'
    });
  } catch (error) {
    next(error);
  }
};
// @desc    Upload face photo for verification
// @route   POST /api/auth/upload-face
// @access  Public (user identified by email in body)
exports.uploadFacePhoto = async (req, res, next) => {
  try {
    const { email } = req.body || {};
    const normalizedEmail = email ? email.trim().toLowerCase() : '';

    if (!normalizedEmail) {
      res.status(400);
      throw new Error('Email is required');
    }

    if (!req.file) {
      res.status(400);
      throw new Error('A face photo file is required');
    }

    const user = await User.findOne({ where: { email: normalizedEmail } });

    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    user.facePhoto = `/uploads/faces/${req.file.filename}`;
    user.faceVerified = true;
    await user.save();

    return res.json({
      message: 'Face photo uploaded successfully',
      faceVerified: true
    });
  } catch (error) {
    next(error);
  }
};
