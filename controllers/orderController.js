const { Op } = require('sequelize');
const { Order, Service, User } = require('../models');
const { haversineDistanceKm } = require('../utils/location');
const {
  canUseCustomerFeatures,
  canUseProviderFeatures
} = require('../utils/sessionRole');
const crypto = require('crypto');

const OPEN_STATUSES = ['pending', 'accepted', 'in_progress'];

const serializeOrder = (order) => {
  if (!order) return null;

  const customer = order.customer;
  const provider = order.provider;
  const service = order.service;
  const providerDistanceKm =
    customer &&
    provider &&
    customer.latitude != null &&
    customer.longitude != null &&
    provider.latitude != null &&
    provider.longitude != null
      ? haversineDistanceKm(customer.latitude, customer.longitude, provider.latitude, provider.longitude)
      : null;

  return {
    id: order.id,
    status: order.status,
    createdAt: order.createdAt,
    acceptedAt: order.acceptedAt,
    declinedAt: order.declinedAt,
    cancelledAt: order.cancelledAt,
    cancellationReason: order.cancellationReason,
    reportMessage: order.reportMessage,
    reportedAt: order.reportedAt,
    service: {
      id: order.serviceId,
      title: order.serviceTitle,
      category: order.serviceCategory,
      basePrice: Number(order.basePrice),
      description: service?.description || null
    },
    customer: customer
      ? {
          id: customer.id,
          fullName: customer.fullName,
          email: customer.email,
          phoneNumber: customer.phoneNumber,
          locationLabel: order.customerLocationLabel,
          latitude: Number(order.customerLat),
          longitude: Number(order.customerLng),
          profilePhoto: customer.profilePhoto
        }
      : null,
    provider: provider
      ? {
          id: provider.id,
          fullName: provider.fullName,
          email: provider.email,
          phoneNumber: provider.phoneNumber,
          locationLabel: provider.locationLabel,
          latitude: provider.latitude === null ? null : Number(provider.latitude),
          longitude: provider.longitude === null ? null : Number(provider.longitude),
          profilePhoto: provider.profilePhoto,
          availabilityStatus: provider.availabilityStatus,
          distanceKm: providerDistanceKm
        }
      : null
  };
};

const getActivityIncludes = () => ([
  {
    model: User,
    as: 'customer',
    attributes: ['id', 'fullName', 'email', 'phoneNumber', 'profilePhoto', 'latitude', 'longitude']
  },
  {
    model: User,
    as: 'provider',
    attributes: ['id', 'fullName', 'email', 'phoneNumber', 'profilePhoto', 'locationLabel', 'latitude', 'longitude', 'availabilityStatus']
  },
  {
    model: Service,
    as: 'service',
    attributes: ['id', 'description']
  }
]);

const getOpenOrderForCustomer = (customerId) =>
  Order.findOne({
    where: {
      customerId,
      status: {
        [Op.in]: OPEN_STATUSES
      }
    },
    include: getActivityIncludes(),
    order: [['createdAt', 'DESC']]
  });

const getOpenOrderForProvider = (providerId) =>
  Order.findOne({
    where: {
      providerId,
      status: {
        [Op.in]: OPEN_STATUSES
      }
    },
    include: getActivityIncludes(),
    order: [['createdAt', 'DESC']]
  });

// @desc    Create a new order from discovery
// @route   POST /api/orders
// @access  Private
exports.createOrder = async (req, res, next) => {
  try {
    const { serviceId } = req.body || {};

    if (!serviceId) {
      res.status(400);
      throw new Error('A service must be selected before placing an order');
    }

    if (!canUseCustomerFeatures(req.user, req.sessionRole)) {
      res.status(403);
      throw new Error('Only customers can place orders');
    }

    const customer = await User.findByPk(req.user.id);
    if (!customer) {
      res.status(404);
      throw new Error('Customer not found');
    }

    if (!customer.locationLabel || customer.latitude === null || customer.longitude === null) {
      res.status(400);
      throw new Error('Your location is required before you can place an order');
    }

    if (!customer.faceVerified) {
      res.status(403);
      throw new Error('Face Verification Required: You must complete face verification before placing an order.');
    }

    const service = await Service.findByPk(serviceId, {
      include: [
        {
          model: User,
          as: 'provider',
          attributes: ['id', 'fullName', 'phoneNumber', 'email', 'locationLabel', 'latitude', 'longitude', 'availabilityStatus', 'profilePhoto']
        }
      ]
    });

    if (!service || !service.provider) {
      res.status(404);
      throw new Error('Service not found');
    }

    if ((service.serviceStatus || 'active') !== 'active') {
      res.status(400);
      throw new Error('This service is currently unavailable');
    }

    if (service.provider.id === customer.id) {
      res.status(400);
      throw new Error('You cannot order your own service');
    }

    if (service.provider.availabilityStatus !== 'available') {
      res.status(400);
      throw new Error('This provider is not available right now');
    }

    const existingCustomerOrder = await Order.findOne({
      where: {
        customerId: customer.id,
        status: {
          [Op.in]: OPEN_STATUSES
        }
      }
    });

    if (existingCustomerOrder) {
      res.status(400);
      throw new Error('You already have an active or pending order');
    }

    const existingProviderOrder = await Order.findOne({
      where: {
        providerId: service.provider.id,
        status: {
          [Op.in]: OPEN_STATUSES
        }
      }
    });

    if (existingProviderOrder) {
      res.status(400);
      throw new Error('This provider already has a pending or active order');
    }

    const order = await Order.create({
      customerId: customer.id,
      providerId: service.provider.id,
      serviceId: service.id,
      serviceTitle: service.title,
      serviceCategory: service.category,
      basePrice: service.basePrice,
      customerLocationLabel: customer.locationLabel,
      customerLat: customer.latitude,
      customerLng: customer.longitude,
      status: 'pending'
    });

    const hydratedOrder = await Order.findByPk(order.id, {
      include: getActivityIncludes()
    });

    res.status(201).json({
      message: 'Order placed successfully',
      order: serializeOrder(hydratedOrder)
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get activity state for both customer and provider views
// @route   GET /api/orders/activity
// @access  Private
exports.getActivityOrders = async (req, res, next) => {
  try {
    const [customerOrder, providerOrder] = await Promise.all([
      canUseCustomerFeatures(req.user, req.sessionRole) ? getOpenOrderForCustomer(req.user.id) : Promise.resolve(null),
      canUseProviderFeatures(req.user, req.sessionRole) ? getOpenOrderForProvider(req.user.id) : Promise.resolve(null)
    ]);

    res.json({
      customerOrder: serializeOrder(customerOrder),
      providerOrder: serializeOrder(providerOrder)
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Provider accepts order
// @route   POST /api/orders/:id/accept
// @access  Private
exports.acceptOrder = async (req, res, next) => {
  try {
    if (!canUseProviderFeatures(req.user, req.sessionRole)) {
      res.status(403);
      throw new Error('Only providers can accept orders');
    }

    const order = await Order.findByPk(req.params.id);
    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    if (order.providerId !== req.user.id) {
      res.status(403);
      throw new Error('You are not authorized to accept this order');
    }

    if (order.status !== 'pending') {
      res.status(400);
      throw new Error('Only pending orders can be accepted');
    }

    const provider = await User.findByPk(req.user.id);

    // Enforce face verification
    if (!provider.faceVerified) {
      res.status(403);
      throw new Error('Face Verification Required: You must complete face verification before accepting orders.');
    }

    const { getPlatformSettingValue } = require('../utils/platformSettings');
    const freeLimit = await getPlatformSettingValue('provider_free_order_limit') || 3;
    if (provider.jobsCompleted >= freeLimit && !provider.hasPaidAccessFee) {
      res.status(403);
      throw new Error('Access Fee Required: You have reached the free order limit. Please pay the one-time access fee to continue accepting orders.');
    }

    order.status = 'accepted';
    order.acceptedAt = new Date();
    await order.save();

    if (provider) {
      provider.availabilityStatus = 'busy';
      await provider.save();
    }

    const hydratedOrder = await Order.findByPk(order.id, {
      include: getActivityIncludes()
    });

    res.json({
      message: 'Order accepted successfully',
      order: serializeOrder(hydratedOrder)
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Provider declines order
// @route   POST /api/orders/:id/decline
// @access  Private
exports.declineOrder = async (req, res, next) => {
  try {
    if (!canUseProviderFeatures(req.user, req.sessionRole)) {
      res.status(403);
      throw new Error('Only providers can decline orders');
    }

    const order = await Order.findByPk(req.params.id);
    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    if (order.providerId !== req.user.id) {
      res.status(403);
      throw new Error('You are not authorized to decline this order');
    }

    if (order.status !== 'pending') {
      res.status(400);
      throw new Error('Only pending orders can be declined');
    }

    order.status = 'declined';
    order.declinedAt = new Date();
    await order.save();

    res.json({
      message: 'Order declined successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Customer cancels own order
// @route   POST /api/orders/:id/cancel
// @access  Private
exports.cancelOrder = async (req, res, next) => {
  try {
    const { reason } = req.body || {};

    if (!canUseCustomerFeatures(req.user, req.sessionRole)) {
      res.status(403);
      throw new Error('Only customers can cancel orders');
    }

    const order = await Order.findByPk(req.params.id);
    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    if (order.customerId !== req.user.id) {
      res.status(403);
      throw new Error('You are not authorized to cancel this order');
    }

    if (!OPEN_STATUSES.includes(order.status)) {
      res.status(400);
      throw new Error('Only pending or accepted orders can be cancelled');
    }

    const previousStatus = order.status;
    order.status = 'cancelled';
    order.cancelledAt = new Date();
    order.cancellationReason = reason ? reason.trim() : null;
    await order.save();

    if (previousStatus === 'accepted') {
      const provider = await User.findByPk(order.providerId);
      if (provider && provider.availabilityStatus === 'busy') {
        provider.availabilityStatus = 'available';
        await provider.save();
      }
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`order_${order.id}`).emit('orderStatusChanged', { status: 'cancelled', orderId: order.id });
      io.to(`user_${order.providerId}`).emit('orderCancelled', { orderId: order.id });
    }

    res.json({
      message: 'Order cancelled successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Customer reports provider on an open order
// @route   POST /api/orders/:id/report
// @access  Private
exports.reportOrder = async (req, res, next) => {
  try {
    const { message } = req.body || {};

    if (!canUseCustomerFeatures(req.user, req.sessionRole)) {
      res.status(403);
      throw new Error('Only customers can report an order');
    }

    if (!message || !message.trim()) {
      res.status(400);
      throw new Error('Please enter a report message');
    }

    const order = await Order.findByPk(req.params.id);
    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    if (order.customerId !== req.user.id) {
      res.status(403);
      throw new Error('You are not authorized to report this order');
    }

    if (!OPEN_STATUSES.includes(order.status)) {
      res.status(400);
      throw new Error('Only pending or accepted orders can be reported');
    }

    order.reportMessage = message.trim();
    order.reportedAt = new Date();
    order.reportStatus = 'open';
    order.reportResolution = null;
    order.adminNote = null;
    order.reviewedByAdminId = null;
    order.reviewedAt = null;
    await order.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`order_${order.id}`).emit('orderReported', { orderId: order.id });
      io.to(`user_${order.providerId}`).emit('orderReported', { orderId: order.id });
    }

    res.json({
      message: 'Report submitted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Customer generates confirmatory token
// @route   POST /api/orders/:id/generate-token
// @access  Private
exports.generateCompletionToken = async (req, res, next) => {
  try {
    if (!canUseCustomerFeatures(req.user, req.sessionRole)) {
      res.status(403);
      throw new Error('Only customers can generate a completion token');
    }

    const order = await Order.findByPk(req.params.id);
    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    if (order.customerId !== req.user.id) {
      res.status(403);
      throw new Error('You are not authorized for this order');
    }

    if (order.status !== 'in_progress') {
      res.status(400);
      throw new Error('Completion token can only be generated when service is in progress');
    }

    // Generate a simple 6-digit numeric token for easy sharing
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    order.completionToken = token;
    order.completionTokenExpiresAt = expiresAt;
    await order.save();

    res.json({
      message: 'Token generated successfully',
      token,
      expiresAt
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Provider completes order using confirmatory token
// @route   POST /api/orders/:id/complete
// @access  Private
exports.completeOrder = async (req, res, next) => {
  try {
    const { token } = req.body || {};

    if (!canUseProviderFeatures(req.user, req.sessionRole)) {
      res.status(403);
      throw new Error('Only providers can complete orders');
    }

    if (!token) {
      res.status(400);
      throw new Error('Completion token is required');
    }

    const order = await Order.findByPk(req.params.id);
    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    if (order.providerId !== req.user.id) {
      res.status(403);
      throw new Error('You are not authorized for this order');
    }

    if (order.status !== 'in_progress') {
      res.status(400);
      throw new Error('Only in progress orders can be completed');
    }

    if (!order.completionToken || order.completionToken !== token) {
      res.status(400);
      throw new Error('Invalid completion token');
    }

    if (new Date(order.completionTokenExpiresAt).getTime() < Date.now()) {
      res.status(400);
      throw new Error('The completion token has expired. Please ask the customer to generate a new one.');
    }

    order.status = 'completed';
    // Clear token data
    order.completionToken = null;
    order.completionTokenExpiresAt = null;
    await order.save();

    const provider = await User.findByPk(req.user.id);
    if (provider) {
      provider.jobsCompleted = (provider.jobsCompleted || 0) + 1;
      if (provider.availabilityStatus === 'busy') {
        provider.availabilityStatus = 'available';
      }
      
      // Task 10 & 11: Apply rating increment if no report
      if (!order.reportMessage) {
        const { getPlatformSettingValue } = require('../utils/platformSettings');
        const increment = Number(await getPlatformSettingValue('provider_rating_increment')) || 5;
        provider.rating = Math.min(100, (Number(provider.rating) || 50) + increment);
      }

      // Update tier logic
      const jobs = provider.jobsCompleted;
      const rating = Number(provider.rating);
      if (jobs >= 100 && rating >= 95) {
        provider.tier = 'platinum';
      } else if (jobs >= 50 && rating >= 85) {
        provider.tier = 'elite';
      } else if (jobs >= 10 && rating >= 70) {
        provider.tier = 'veteran';
      } else {
        provider.tier = 'rookie';
      }
      
      await provider.save();
    }

    // Emit via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.to(`order_${order.id}`).emit('orderStatusChanged', { status: 'completed', orderId: order.id });
      io.to(`user_${order.customerId}`).emit('orderCompleted', { orderId: order.id });
    }

    res.json({
      message: 'Order completed successfully'
    });
  } catch (error) {
    next(error);
  }
};
