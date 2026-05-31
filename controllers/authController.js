const { User, Service } = require('../models');
const generateToken = require('../utils/generateToken');
const crypto = require('crypto');
const { sendPasswordResetEmail } = require('../utils/mailer');

const serializeUser = (user) => ({
  id: user.id,
  fullName: user.fullName,
  email: user.email,
  phoneNumber: user.phoneNumber,
  locationLabel: user.locationLabel,
  latitude: user.latitude,
  longitude: user.longitude,
  role: user.role,
  rating: user.rating,
  tier: user.tier,
  jobsCompleted: user.jobsCompleted,
  availabilityStatus: user.availabilityStatus,
  serviceCategory: user.serviceCategory,
  serviceTitle: user.serviceTitle,
  basePrice: user.basePrice,
  serviceDescription: user.serviceDescription,
  profilePhoto: user.profilePhoto,
  accountStatus: user.accountStatus,
  token: generateToken(user.id)
});

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
      role,
      serviceCategory,
      serviceTitle,
      basePrice,
      serviceDescription
    } = req.body || {};

    // Handle file upload
    let profilePhotoPath = '/assets/images/avatar.jpg'; // Default
    if (req.file) {
      profilePhotoPath = `/uploads/profiles/${req.file.filename}`;
    }

    const normalizedRole = role || 'customer';
    const normalizedEmail = email ? email.trim().toLowerCase() : '';
    const normalizedCategory = serviceCategory ? serviceCategory.trim() : null;
    const normalizedTitle = serviceTitle ? serviceTitle.trim() : null;
    const normalizedDescription = serviceDescription
      ? serviceDescription.trim()
      : null;
    const normalizedLocationLabel = locationLabel ? locationLabel.trim() : null;
    const normalizedLatitude =
      latitude === '' || latitude === null || typeof latitude === 'undefined'
        ? null
        : Number(latitude);
    const normalizedLongitude =
      longitude === '' || longitude === null || typeof longitude === 'undefined'
        ? null
        : Number(longitude);
    const normalizedBasePrice =
      basePrice === '' || basePrice === null || typeof basePrice === 'undefined'
        ? null
        : Number(basePrice);

    if (!normalizedLocationLabel) {
      res.status(400);
      throw new Error('Location name is required');
    }

    const hasLatitude = normalizedLatitude !== null;
    const hasLongitude = normalizedLongitude !== null;

    if (
      Number.isNaN(normalizedLatitude) ||
      Number.isNaN(normalizedLongitude) ||
      hasLatitude !== hasLongitude
    ) {
      res.status(400);
      throw new Error('Location coordinates must be valid when provided');
    }

    if (normalizedRole === 'provider') {
      if (
        !normalizedCategory ||
        !normalizedTitle ||
        normalizedBasePrice === null ||
        Number.isNaN(normalizedBasePrice) ||
        !normalizedDescription
      ) {
        res.status(400);
        throw new Error('Provider accounts require category, service title, base price, and description');
      }
    }

    const userExists = await User.findOne({ where: { email: normalizedEmail } });

    if (userExists) {
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
      profilePhoto: profilePhotoPath,
      serviceCategory: normalizedRole === 'provider' ? normalizedCategory : null,
      serviceTitle: normalizedRole === 'provider' ? normalizedTitle : null,
      basePrice: normalizedRole === 'provider' ? normalizedBasePrice : null,
      serviceDescription:
        normalizedRole === 'provider' ? normalizedDescription : null
    });

    if (user) {
      // Create initial service for provider
      if (normalizedRole === 'provider') {
        await Service.create({
          userId: user.id,
          category: normalizedCategory,
          title: normalizedTitle,
          basePrice: normalizedBasePrice,
          description: normalizedDescription,
          isDefault: true
        });
      }
      res.status(201).json(serializeUser(user));
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
