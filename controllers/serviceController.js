const { Op } = require('sequelize');
const { Service, User } = require('../models');
const { getBoundingBox, haversineDistanceKm } = require('../utils/location');

const normalizeDiscoveryRole = (role) => {
  if (role === 'provider' || role === 'both') return 'provider';
  return 'customer';
};

const buildDiscoveryItem = (service, viewerLat, viewerLng) => {
  const provider = service.provider;
  const distanceKm = haversineDistanceKm(
    viewerLat,
    viewerLng,
    provider.latitude,
    provider.longitude
  );

  return {
    id: service.id,
    category: service.category,
    title: service.title,
    description: service.description,
    basePrice: Number(service.basePrice),
    isDefault: service.isDefault,
    distanceKm,
    provider: {
      id: provider.id,
      fullName: provider.fullName,
      profilePhoto: provider.profilePhoto,
      rating: Number(provider.rating || 50),
      tier: provider.tier,
      availabilityStatus: provider.availabilityStatus,
      locationLabel: provider.locationLabel,
      latitude: Number(provider.latitude),
      longitude: Number(provider.longitude)
    }
  };
};

// @desc    Get discovery feed
// @route   GET /api/services/discovery
// @access  Private
exports.getDiscoveryFeed = async (req, res, next) => {
  try {
    const currentUser = await User.findByPk(req.user.id, {
      attributes: [
        'id',
        'role',
        'locationLabel',
        'latitude',
        'longitude'
      ]
    });

    if (!currentUser) {
      res.status(404);
      throw new Error('User not found');
    }

    const requestedRole = normalizeDiscoveryRole(req.query.role || currentUser.role);
    const search = (req.query.search || '').trim();
    const category = (req.query.category || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 48);

    if (requestedRole === 'provider') {
      return res.json({
        role: 'provider',
        location: {
          label: currentUser.locationLabel,
          latitude: currentUser.latitude,
          longitude: currentUser.longitude
        },
        requests: [],
        meta: {
          message: 'Customer request discovery will become active with the order flow.'
        }
      });
    }

    const viewerLat = Number(req.query.lat ?? currentUser.latitude);
    const viewerLng = Number(req.query.lng ?? currentUser.longitude);

    if (Number.isNaN(viewerLat) || Number.isNaN(viewerLng)) {
      res.status(400);
      throw new Error('A valid location is required to load nearby services');
    }

    const providerWhere = {
      id: {
        [Op.ne]: currentUser.id
      },
      role: {
        [Op.in]: ['provider', 'both']
      },
      latitude: {
        [Op.ne]: null
      },
      longitude: {
        [Op.ne]: null
      }
    };
    const serviceWhere = {};
    const boundingBox = getBoundingBox(viewerLat, viewerLng, 50);

    if (boundingBox) {
      providerWhere.latitude = {
        [Op.between]: [boundingBox.minLat, boundingBox.maxLat]
      };
      providerWhere.longitude = {
        [Op.between]: [boundingBox.minLng, boundingBox.maxLng]
      };
    }

    if (category && category.toLowerCase() !== 'all') {
      serviceWhere.category = category;
    }

    if (search) {
      serviceWhere[Op.or] = [
        { title: { [Op.like]: `%${search}%` } },
        { category: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } }
      ];
    }

    const services = await Service.findAll({
      where: serviceWhere,
      include: [
        {
          model: User,
          as: 'provider',
          required: true,
          where: providerWhere,
          attributes: [
            'id',
            'fullName',
            'profilePhoto',
            'rating',
            'tier',
            'availabilityStatus',
            'locationLabel',
            'latitude',
            'longitude'
          ]
        }
      ],
      limit: limit * 3
    });

    const filteredItems = services
      .map((service) => buildDiscoveryItem(service, viewerLat, viewerLng))
      .filter((item) => item.distanceKm !== null)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);

    const categories = await Service.findAll({
      attributes: ['category'],
      group: ['category'],
      order: [['category', 'ASC']]
    });

    res.json({
      role: 'customer',
      location: {
        label: currentUser.locationLabel,
        latitude: viewerLat,
        longitude: viewerLng
      },
      services: filteredItems,
      categories: categories.map((entry) => entry.category),
      meta: {
        total: filteredItems.length,
        search,
        category: category || 'all'
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add a new service
// @route   POST /api/services
// @access  Private (Provider only)
exports.addService = async (req, res, next) => {
  try {
    const { category, title, basePrice, description } = req.body;

    if (!['provider', 'both'].includes(req.user.role)) {
      res.status(403);
      throw new Error('Only providers can add services');
    }

    const serviceCount = await Service.count({ where: { userId: req.user.id } });
    if (serviceCount >= 5) {
      res.status(400);
      throw new Error('Maximum of 5 services allowed');
    }

    const service = await Service.create({
      userId: req.user.id,
      category,
      title,
      basePrice,
      description
    });

    res.status(201).json(service);
  } catch (error) {
    next(error);
  }
};

// @desc    Update a service
// @route   PUT /api/services/:id
// @access  Private (Owner only)
exports.updateService = async (req, res, next) => {
  try {
    const { category, title, basePrice, description } = req.body;
    const service = await Service.findByPk(req.params.id);

    if (!service) {
      res.status(404);
      throw new Error('Service not found');
    }

    if (service.userId !== req.user.id) {
      res.status(403);
      throw new Error('Unauthorized access to service');
    }

    service.category = category || service.category;
    service.title = title || service.title;
    service.basePrice = basePrice || service.basePrice;
    service.description = description || service.description;

    await service.save();

    res.json(service);
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a service
// @route   DELETE /api/services/:id
// @access  Private (Owner only)
exports.deleteService = async (req, res, next) => {
  try {
    const service = await Service.findByPk(req.params.id);

    if (!service) {
      res.status(404);
      throw new Error('Service not found');
    }

    if (service.userId !== req.user.id) {
      res.status(403);
      throw new Error('Unauthorized access to service');
    }

    await service.destroy();

    res.json({ message: 'Service removed' });
  } catch (error) {
    next(error);
  }
};
