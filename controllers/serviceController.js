const { Service } = require('../models');

// @desc    Add a new service
// @route   POST /api/services
// @access  Private (Provider only)
exports.addService = async (req, res, next) => {
  try {
    const { category, title, basePrice, description } = req.body;

    if (req.user.role !== 'provider') {
      res.status(403);
      throw new Error('Only providers can add services');
    }

    // Check if provider already has 5 services
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
