const { User, Service } = require('../models');

// @desc    Get user dashboard data
// @route   GET /api/dashboard
// @access  Private
exports.getDashboard = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: [
        {
          model: Service,
          as: 'services'
        }
      ]
    });

    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    res.json({
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        rating: user.rating,
        tier: user.tier,
        jobsCompleted: user.jobsCompleted,
        availabilityStatus: user.availabilityStatus,
        services: user.services,
        pushNotifications: user.pushNotifications,
        emailAlerts: user.emailAlerts,
        smsUpdates: user.smsUpdates
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Upgrade user account to include another role (become 'both')
// @route   POST /api/users/upgrade
// @access  Private
exports.upgradeAccount = async (req, res, next) => {
  try {
    const { targetRole, serviceCategory, serviceTitle, basePrice, serviceDescription } = req.body || {};

    const user = await User.findByPk(req.user.id);
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    if (user.role === 'both') {
      res.status(400);
      throw new Error('User already has both accounts');
    }

    if (user.role === targetRole) {
      res.status(400);
      throw new Error(`User is already a ${targetRole}`);
    }

    if (targetRole === 'provider') {
      const normalizedBasePrice = Number(basePrice);
      if (!serviceCategory || !serviceTitle || !basePrice || Number.isNaN(normalizedBasePrice) || !serviceDescription) {
        res.status(400);
        throw new Error('Provider accounts require category, service title, base price, and description');
      }

      user.serviceCategory = serviceCategory.trim();
      user.serviceTitle = serviceTitle.trim();
      user.basePrice = normalizedBasePrice;
      user.serviceDescription = serviceDescription.trim();

      // Create initial service for the new provider
      await Service.create({
        userId: user.id,
        category: user.serviceCategory,
        title: user.serviceTitle,
        basePrice: user.basePrice,
        description: user.serviceDescription,
        isDefault: true
      });
    }

    user.role = 'both';
    await user.save();

    res.json({
      message: `Account successfully upgraded to include ${targetRole} profile`,
      user: {
        id: user.id,
        role: user.role,
        serviceCategory: user.serviceCategory,
        serviceTitle: user.serviceTitle,
        basePrice: user.basePrice,
        serviceDescription: user.serviceDescription
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
exports.updateProfile = async (req, res, next) => {
  try {
    const { fullName, email, phoneNumber } = req.body || {};

    const user = await User.findByPk(req.user.id);
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    if (fullName) user.fullName = fullName;
    if (email) user.email = email;
    if (phoneNumber) user.phoneNumber = phoneNumber;

    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: {
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user preferences
// @route   PUT /api/users/preferences
// @access  Private
exports.updatePreferences = async (req, res, next) => {
  try {
    const { pushNotifications, emailAlerts, smsUpdates } = req.body || {};

    const user = await User.findByPk(req.user.id);
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    if (pushNotifications !== undefined) user.pushNotifications = pushNotifications;
    if (emailAlerts !== undefined) user.emailAlerts = emailAlerts;
    if (smsUpdates !== undefined) user.smsUpdates = smsUpdates;

    await user.save();

    res.json({
      message: 'Preferences updated successfully',
      preferences: {
        pushNotifications: user.pushNotifications,
        emailAlerts: user.emailAlerts,
        smsUpdates: user.smsUpdates
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user password
// @route   PUT /api/users/password
// @access  Private
exports.updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    const user = await User.findByPk(req.user.id);
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      res.status(401);
      throw new Error('Invalid current password');
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete user account
// @route   DELETE /api/users
// @access  Private
exports.deleteAccount = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    await user.destroy();

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user availability status
// @route   PUT /api/users/status
// @access  Private
exports.updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body || {};

    if (!['available', 'busy', 'unavailable'].includes(status)) {
      res.status(400);
      throw new Error('Invalid status. Must be available, busy, or unavailable');
    }

    const user = await User.findByPk(req.user.id);
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    user.availabilityStatus = status;
    await user.save();

    res.json({
      message: 'Status updated successfully',
      availabilityStatus: user.availabilityStatus
    });
  } catch (error) {
    next(error);
  }
};
