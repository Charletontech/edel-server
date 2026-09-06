const { Business, Service } = require('../models');
const { canUseProviderFeatures } = require('../utils/sessionRole');

exports.createBusiness = async (req, res, next) => {
  try {
    if (!canUseProviderFeatures(req.user, req.sessionRole)) {
      res.status(403);
      throw new Error('Only providers can create businesses');
    }
    const { name, businessType, category } = req.body;
    
    // Check limit
    const existingBusinesses = await Business.count({
      where: { providerId: req.user.id }
    });
    
    if (existingBusinesses >= 3) {
      res.status(400);
      throw new Error('Maximum limit of 3 businesses reached');
    }
    
    const business = await Business.create({
      providerId: req.user.id,
      name,
      businessType,
      category
    });
    
    res.status(201).json(business);
  } catch (error) {
    next(error);
  }
};

exports.getProviderBusinesses = async (req, res, next) => {
  try {
    if (!canUseProviderFeatures(req.user, req.sessionRole)) {
      res.status(403);
      throw new Error('Only providers can view their businesses');
    }
    const businesses = await Business.findAll({
      where: { providerId: req.user.id },
      include: [
        {
          model: Service,
          as: 'items',
          required: false // LEFT JOIN to get businesses even with 0 items
        }
      ],
      order: [['createdAt', 'DESC']]
    });
    
    res.json(businesses);
  } catch (error) {
    next(error);
  }
};

exports.deleteBusiness = async (req, res, next) => {
  try {
    if (!canUseProviderFeatures(req.user, req.sessionRole)) {
      res.status(403);
      throw new Error('Only providers can delete businesses');
    }
    const { id } = req.params;
    
    const business = await Business.findOne({
      where: { id, providerId: req.user.id }
    });
    
    if (!business) {
      res.status(404);
      throw new Error('Business not found or unauthorized');
    }
    
    // Destroy the business. If cascade isn't strictly set up, we should manually delete items
    await Service.destroy({
      where: { businessId: id }
    });
    
    await business.destroy();
    
    res.json({ message: 'Business and all associated items deleted successfully' });
  } catch (error) {
    next(error);
  }
};
