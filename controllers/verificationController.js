const crypto = require('crypto');
const { Order, Session, Verification, User } = require('../models');
const { haversineDistanceKm } = require('../utils/location');
const { getPlatformSettingValue } = require('../utils/platformSettings');

const SESSION_TTL_MINUTES = 3;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const getDistanceMeters = (fromLat, fromLng, toLat, toLng) => {
  const distanceKm = haversineDistanceKm(fromLat, fromLng, toLat, toLng);
  if (distanceKm === null) return null;
  return distanceKm * 1000;
};

const getOrderWithRelations = (orderId) =>
  Order.findByPk(orderId, {
    include: [
      {
        model: User,
        as: 'customer',
        attributes: ['id', 'fullName', 'latitude', 'longitude', 'locationLabel']
      },
      {
        model: User,
        as: 'provider',
        attributes: ['id', 'fullName', 'latitude', 'longitude', 'locationLabel', 'availabilityStatus']
      }
    ]
  });

// @desc    Create a QR verification session
// @route   POST /api/start-session
// @access  Private
exports.startSession = async (req, res, next) => {
  try {
    const maxAllowedAccuracy = Number(
      await getPlatformSettingValue('verification_max_accuracy_meters')
    ) || 100;
    const { orderId, lat, lng, accuracy } = req.body || {};
    const normalizedOrderId = Number(orderId);
    const normalizedLat = toNumber(lat);
    const normalizedLng = toNumber(lng);
    const normalizedAccuracy = toNumber(accuracy);

    if (!Number.isInteger(normalizedOrderId) || normalizedOrderId <= 0) {
      res.status(400);
      throw new Error('A valid order is required');
    }

    if ([normalizedLat, normalizedLng, normalizedAccuracy].some((value) => value === null)) {
      res.status(400);
      throw new Error('Valid location coordinates are required');
    }

    const order = await getOrderWithRelations(normalizedOrderId);
    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    if (order.customerId !== req.user.id) {
      res.status(403);
      throw new Error('You are not authorized to start this service');
    }

    if (order.status !== 'accepted') {
      res.status(400);
      throw new Error('The order must be accepted before the service can start');
    }

    if (normalizedAccuracy > maxAllowedAccuracy) {
      res.status(400);
      throw new Error('Location accuracy is too poor to create a verification session');
    }

    const now = new Date();
    const existingSession = await Session.findOne({
      where: {
        orderId: normalizedOrderId,
        status: 'pending',
      },
      order: [['createdAt', 'DESC']],
    });

    if (existingSession && new Date(existingSession.expiresAt).getTime() > now.getTime()) {
      return res.json({
        message: 'Verification session is ready',
        sessionId: existingSession.sessionId,
        token: existingSession.token,
        expiresAt: existingSession.expiresAt,
      });
    }

    const session = await Session.create({
      sessionId: crypto.randomUUID(),
      orderId: normalizedOrderId,
      customerId: req.user.id,
      token: crypto.randomBytes(24).toString('hex'),
      customerLat: normalizedLat,
      customerLng: normalizedLng,
      customerAccuracy: normalizedAccuracy,
      expiresAt: new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000),
      status: 'pending',
    });

    res.status(201).json({
      message: 'Verification session created',
      sessionId: session.sessionId,
      token: session.token,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify QR session and start service
// @route   POST /api/verify-session
// @access  Private
exports.verifySession = async (req, res, next) => {
  try {
    const maxAllowedAccuracy = Number(
      await getPlatformSettingValue('verification_max_accuracy_meters')
    ) || 100;
    const maxAllowedDistanceMeters = Number(
      await getPlatformSettingValue('verification_max_distance_meters')
    ) || 50;
    const {
      session_id,
      sessionId,
      token,
      provider_lat,
      provider_lng,
      provider_accuracy,
    } = req.body || {};

    const requestedSessionId = session_id || sessionId;
    const normalizedProviderLat = toNumber(provider_lat);
    const normalizedProviderLng = toNumber(provider_lng);
    const normalizedProviderAccuracy = toNumber(provider_accuracy);

    if (!requestedSessionId || !token) {
      res.status(400);
      throw new Error('Invalid session');
    }

    if ([normalizedProviderLat, normalizedProviderLng, normalizedProviderAccuracy].some((value) => value === null)) {
      res.status(400);
      throw new Error('Valid provider location is required');
    }

    if (normalizedProviderAccuracy > maxAllowedAccuracy) {
      res.status(400);
      throw new Error('Location accuracy too poor to verify');
    }

    const session = await Session.findOne({
      where: { sessionId: requestedSessionId },
      include: [
        {
          model: Order,
          as: 'order',
          include: [
            {
              model: User,
              as: 'provider',
              attributes: ['id', 'fullName', 'availabilityStatus'],
            },
            {
              model: User,
              as: 'customer',
              attributes: ['id', 'fullName', 'latitude', 'longitude'],
            },
          ],
        },
      ],
    });

    if (!session) {
      res.status(404);
      throw new Error('Invalid session');
    }

    if (session.status !== 'pending') {
      res.status(400);
      throw new Error('Session already used or expired');
    }

    if (session.token !== token) {
      res.status(400);
      throw new Error('Invalid session');
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      res.status(400);
      throw new Error('QR code has expired');
    }

    const order = session.order;
    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    if (order.providerId !== req.user.id) {
      res.status(403);
      throw new Error('You are not authorized to verify this session');
    }

    if (order.status !== 'accepted') {
      res.status(400);
      throw new Error('This order cannot be verified right now');
    }

    const customerAccuracy = toNumber(session.customerAccuracy);
    if (customerAccuracy === null || customerAccuracy > maxAllowedAccuracy) {
      res.status(400);
      throw new Error('Location accuracy too poor to verify');
    }

    const distanceMeters = getDistanceMeters(
      session.customerLat,
      session.customerLng,
      normalizedProviderLat,
      normalizedProviderLng,
    );

    if (distanceMeters === null) {
      res.status(400);
      throw new Error('Could not measure proximity');
    }

    if (distanceMeters > maxAllowedDistanceMeters) {
      res.status(400);
      throw new Error('You are not close enough to the customer. Move closer and try again.');
    }

    session.status = 'started';
    session.verifiedAt = new Date();
    await session.save();

    await Verification.create({
      sessionId: session.sessionId,
      orderId: order.id,
      providerId: req.user.id,
      providerLat: normalizedProviderLat,
      providerLng: normalizedProviderLng,
      providerAccuracy: normalizedProviderAccuracy,
      distance: distanceMeters,
      verifiedAt: new Date(),
    });

    order.status = 'in_progress';
    order.startedAt = new Date();
    await order.save();

    const provider = await User.findByPk(req.user.id);
    if (provider && provider.availabilityStatus !== 'busy') {
      provider.availabilityStatus = 'busy';
      await provider.save();
    }

    // Emit via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.to(`order_${order.id}`).emit('orderStatusChanged', { status: 'in_progress', orderId: order.id });
    }

    res.json({
      success: true,
      message: 'Service started successfully',
      distance: Number(distanceMeters.toFixed(2)),
    });
  } catch (error) {
    next(error);
  }
};
