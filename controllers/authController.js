const { User, Service } = require('../models');
const generateToken = require('../utils/generateToken');

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

    const normalizedRole = role || 'customer';
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

    if (
      !normalizedLocationLabel ||
      normalizedLatitude === null ||
      normalizedLongitude === null ||
      Number.isNaN(normalizedLatitude) ||
      Number.isNaN(normalizedLongitude)
    ) {
      res.status(400);
      throw new Error('Location name and coordinates are required');
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

    const userExists = await User.findOne({ where: { email } });

    if (userExists) {
      res.status(400);
      throw new Error('User already exists');
    }

    const user = await User.create({
      fullName,
      email,
      password,
      phoneNumber,
      locationLabel: normalizedLocationLabel,
      latitude: normalizedLatitude,
      longitude: normalizedLongitude,
      role: normalizedRole,
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

    const user = await User.findOne({ where: { email } });

    if (user && (await user.matchPassword(password))) {
      res.json(serializeUser(user));
    } else {
      res.status(401);
      throw new Error('Invalid email or password');
    }
  } catch (error) {
    next(error);
  }
};
