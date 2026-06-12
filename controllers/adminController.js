const { Op } = require('sequelize');
const {
  User,
  Service,
  Order,
  Session,
  Verification,
  PlatformSetting,
  AdminActionLog,
  Category
} = require('../models');

// --- Category Management ---

exports.getAdminCategories = async (req, res, next) => {
  try {
    const categories = await Category.findAll({
      order: [['name', 'ASC']]
    });
    res.json(categories);
  } catch (error) {
    next(error);
  }
};

exports.createCategory = async (req, res, next) => {
  try {
    const { name, iconName, isActive } = req.body;
    
    if (!name || !iconName) {
      res.status(400);
      throw new Error('Name and Icon Name are required');
    }

    const category = await Category.create({
      name: name.toLowerCase(),
      iconName,
      isActive: isActive !== undefined ? isActive : true
    });

    res.status(201).json(category);
  } catch (error) {
    next(error);
  }
};

exports.updateCategory = async (req, res, next) => {
  try {
    const { name, iconName, isActive } = req.body;
    const category = await Category.findByPk(req.params.id);

    if (!category) {
      res.status(404);
      throw new Error('Category not found');
    }

    if (name) category.name = name.toLowerCase();
    if (iconName) category.iconName = iconName;
    if (isActive !== undefined) category.isActive = isActive;

    await category.save();
    res.json(category);
  } catch (error) {
    next(error);
  }
};

exports.deleteCategory = async (req, res, next) => {
  try {
    const category = await Category.findByPk(req.params.id);

    if (!category) {
      res.status(404);
      throw new Error('Category not found');
    }

    await category.destroy();
    res.json({ message: 'Category removed' });
  } catch (error) {
    next(error);
  }
};
const {
  SETTING_DEFINITIONS,
  SETTING_KEYS,
  ensurePlatformSettings
} = require('../utils/platformSettings');
const { sendCustomAdminEmail } = require('../utils/mailer');

const ACTIVE_ORDER_STATUSES = ['pending', 'accepted', 'in_progress'];
const REPORT_RESOLUTION_VALUES = new Set([
  'no_action',
  'warning_issued',
  'provider_suspended',
  'customer_suspended',
  'service_disabled'
]);

const serializeUserSummary = (user) => ({
  id: user.id,
  fullName: user.fullName,
  email: user.email,
  phoneNumber: user.phoneNumber,
  role: user.role,
  rating: Number(user.rating || 0),
  tier: user.tier,
  accountStatus: user.accountStatus || 'active',
  availabilityStatus: user.availabilityStatus,
  locationLabel: user.locationLabel,
  jobsCompleted: user.jobsCompleted,
  createdAt: user.createdAt,
  profilePhoto: user.profilePhoto
});

const serializeServiceSummary = (service) => ({
  id: service.id,
  userId: service.userId,
  title: service.title,
  category: service.category,
  basePrice: Number(service.basePrice || 0),
  description: service.description,
  isDefault: Boolean(service.isDefault),
  serviceStatus: service.serviceStatus || 'active',
  disabledReason: service.disabledReason,
  disabledAt: service.disabledAt,
  createdAt: service.createdAt,
  updatedAt: service.updatedAt
});

const buildOrderResponse = (order) => {
  const reportStatus = order.reportMessage ? (order.reportStatus || 'open') : null;

  return {
    id: order.id,
    status: order.status,
    serviceTitle: order.serviceTitle,
    serviceCategory: order.serviceCategory,
    basePrice: Number(order.basePrice || 0),
    customerLocationLabel: order.customerLocationLabel,
    customerLat: order.customerLat === null ? null : Number(order.customerLat),
    customerLng: order.customerLng === null ? null : Number(order.customerLng),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    acceptedAt: order.acceptedAt,
    startedAt: order.startedAt,
    declinedAt: order.declinedAt,
    cancelledAt: order.cancelledAt,
    cancellationReason: order.cancellationReason,
    reportMessage: order.reportMessage,
    reportedAt: order.reportedAt,
    reportStatus,
    reportResolution: order.reportResolution,
    adminNote: order.adminNote,
    reviewedAt: order.reviewedAt,
    customer: order.customer ? serializeUserSummary(order.customer) : null,
    provider: order.provider ? serializeUserSummary(order.provider) : null,
    service: order.service ? serializeServiceSummary(order.service) : null,
    reviewedByAdmin: order.reviewedByAdmin ? serializeUserSummary(order.reviewedByAdmin) : null,
    sessions: Array.isArray(order.sessions)
      ? order.sessions.map((session) => ({
          id: session.id,
          sessionId: session.sessionId,
          status: session.status,
          customerAccuracy: session.customerAccuracy,
          expiresAt: session.expiresAt,
          verifiedAt: session.verifiedAt,
          createdAt: session.createdAt
        }))
      : [],
    verifications: Array.isArray(order.verifications)
      ? order.verifications.map((verification) => ({
          id: verification.id,
          sessionId: verification.sessionId,
          providerId: verification.providerId,
          providerLat: Number(verification.providerLat),
          providerLng: Number(verification.providerLng),
          providerAccuracy: verification.providerAccuracy,
          distance: Number(verification.distance),
          verifiedAt: verification.verifiedAt
        }))
      : []
  };
};

const parseBoolean = (value) => {
  if (value === true || value === 'true' || value === '1' || value === 1) return true;
  if (value === false || value === 'false' || value === '0' || value === 0) return false;
  return null;
};

const logAdminAction = async (adminUserId, targetType, targetId, actionType, reason, metadata = null) => {
  await AdminActionLog.create({
    adminUserId,
    targetType,
    targetId,
    actionType,
    reason: reason || null,
    metadataJson: metadata ? JSON.stringify(metadata) : null
  });
};

const isValidEmailAddress = (value) => {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
};

const getOrderIncludes = (includeFullHistory = false) => {
  const includes = [
    {
      model: User,
      as: 'customer',
      attributes: { exclude: ['password'] }
    },
    {
      model: User,
      as: 'provider',
      attributes: { exclude: ['password'] }
    },
    {
      model: Service,
      as: 'service'
    },
    {
      model: User,
      as: 'reviewedByAdmin',
      attributes: { exclude: ['password'] },
      required: false
    }
  ];

  if (includeFullHistory) {
    includes.push(
      {
        model: Session,
        as: 'sessions',
        required: false,
        separate: true,
        order: [['createdAt', 'DESC']]
      },
      {
        model: Verification,
        as: 'verifications',
        required: false,
        separate: true,
        order: [['verifiedAt', 'DESC']]
      }
    );
  }

  return includes;
};

const buildSearchWhere = (search, fields) => {
  if (!search) return null;

  const conditions = fields.map((field) => ({
    [field]: {
      [Op.like]: `%${search}%`
    }
  }));

  if (/^\d+$/.test(search)) {
    conditions.push({ id: Number(search) });
  }

  return { [Op.or]: conditions };
};

exports.getDashboard = async (req, res, next) => {
  try {
    const [totalUsers, totalCustomers, totalProviders, totalCompletedOrders, totalActiveOrders, totalSuspendedUsers] =
      await Promise.all([
        User.count(),
        User.count({ where: { role: { [Op.in]: ['customer', 'both'] } } }),
        User.count({ where: { role: { [Op.in]: ['provider', 'both'] } } }),
        Order.count({ where: { status: 'completed' } }),
        Order.count({ where: { status: { [Op.in]: ACTIVE_ORDER_STATUSES } } }),
        User.count({ where: { accountStatus: 'suspended' } })
      ]);

    const totalOpenReports = await Order.count({
      where: {
        reportMessage: { [Op.ne]: null },
        reportedAt: { [Op.ne]: null },
        [Op.or]: [
          { reportStatus: null },
          { reportStatus: 'open' }
        ]
      }
    });

    const [recentSignups, recentOrders, recentReports] = await Promise.all([
      User.findAll({
        order: [['createdAt', 'DESC']],
        limit: 5,
        attributes: { exclude: ['password'] }
      }),
      Order.findAll({
        include: getOrderIncludes(false),
        order: [['createdAt', 'DESC']],
        limit: 5
      }),
      Order.findAll({
        where: {
          reportMessage: { [Op.ne]: null },
          reportedAt: { [Op.ne]: null }
        },
        include: getOrderIncludes(false),
        order: [['reportedAt', 'DESC']],
        limit: 5
      })
    ]);

    res.json({
      stats: {
        totalUsers,
        totalCustomers,
        totalProviders,
        totalCompletedOrders,
        totalActiveOrders,
        totalOpenReports,
        totalSuspendedUsers
      },
      recentSignups: recentSignups.map(serializeUserSummary),
      recentOrders: recentOrders.map(buildOrderResponse),
      recentReports: recentReports.map(buildOrderResponse)
    });
  } catch (error) {
    next(error);
  }
};

exports.getUsers = async (req, res, next) => {
  try {
    const search = (req.query.search || '').trim();
    const role = (req.query.role || '').trim();
    const accountStatus = (req.query.accountStatus || '').trim();
    const availabilityStatus = (req.query.availabilityStatus || '').trim();
    const dateJoined = (req.query.dateJoined || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);

    const where = {};
    const searchWhere = buildSearchWhere(search, ['fullName', 'email', 'phoneNumber']);
    if (searchWhere) Object.assign(where, searchWhere);
    if (role) where.role = role;
    if (accountStatus) where.accountStatus = accountStatus;
    if (availabilityStatus) where.availabilityStatus = availabilityStatus;
    if (dateJoined) {
      where.createdAt = {
        [Op.gte]: new Date(`${dateJoined}T00:00:00.000Z`),
        [Op.lte]: new Date(`${dateJoined}T23:59:59.999Z`)
      };
    }

    const users = await User.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      attributes: { exclude: ['password'] }
    });

    res.json({
      users: users.map(serializeUserSummary)
    });
  } catch (error) {
    next(error);
  }
};

exports.getUserDetail = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ['password'] },
      include: [
        {
          model: Service,
          as: 'services',
          required: false
        }
      ]
    });

    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    const [customerOrders, providerOrders] = await Promise.all([
      Order.findAll({
        where: { customerId: user.id },
        include: getOrderIncludes(false),
        order: [['createdAt', 'DESC']],
        limit: 5
      }),
      Order.findAll({
        where: { providerId: user.id },
        include: getOrderIncludes(false),
        order: [['createdAt', 'DESC']],
        limit: 5
      })
    ]);

    res.json({
      user: {
        ...serializeUserSummary(user),
        locationLabel: user.locationLabel,
        latitude: user.latitude === null ? null : Number(user.latitude),
        longitude: user.longitude === null ? null : Number(user.longitude),
        suspensionReason: user.suspensionReason,
        suspendedAt: user.suspendedAt,
        services: (user.services || []).map(serializeServiceSummary),
        recentCustomerOrders: customerOrders.map(buildOrderResponse),
        recentProviderOrders: providerOrders.map(buildOrderResponse)
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.suspendUser = async (req, res, next) => {
  try {
    const reason = (req.body.reason || '').trim();
    if (!reason) {
      res.status(400);
      throw new Error('Suspension reason is required');
    }

    const user = await User.findByPk(req.params.id);
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    if (user.id === req.user.id) {
      res.status(400);
      throw new Error('You cannot suspend your own admin account');
    }

    user.accountStatus = 'suspended';
    user.suspensionReason = reason;
    user.suspendedAt = new Date();
    await user.save();

    await logAdminAction(req.user.id, 'user', user.id, 'suspend_user', reason, {
      role: user.role
    });

    res.json({
      message: 'User suspended successfully',
      user: serializeUserSummary(user)
    });
  } catch (error) {
    next(error);
  }
};

exports.restoreUser = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    user.accountStatus = 'active';
    user.suspensionReason = null;
    user.suspendedAt = null;
    await user.save();

    await logAdminAction(req.user.id, 'user', user.id, 'restore_user', null, {
      role: user.role
    });

    res.json({
      message: 'User restored successfully',
      user: serializeUserSummary(user)
    });
  } catch (error) {
    next(error);
  }
};

exports.makeAdmin = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    const previousRole = user.role;
    user.role = 'admin';
    await user.save();

    await logAdminAction(req.user.id, 'user', user.id, 'make_admin', null, {
      previousRole
    });

    res.json({
      message: 'User promoted to admin successfully',
      user: serializeUserSummary(user)
    });
  } catch (error) {
    next(error);
  }
};

exports.getOrders = async (req, res, next) => {
  try {
    const search = (req.query.search || '').trim();
    const status = (req.query.status || '').trim();
    const reportedOnly = parseBoolean(req.query.reportedOnly);
    const dateFrom = (req.query.dateFrom || '').trim();
    const dateTo = (req.query.dateTo || '').trim();

    const where = {};
    if (status) where.status = status;
    if (reportedOnly === true) {
      where.reportMessage = { [Op.ne]: null };
      where.reportedAt = { [Op.ne]: null };
    }
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt[Op.gte] = new Date(`${dateFrom}T00:00:00.000Z`);
      if (dateTo) where.createdAt[Op.lte] = new Date(`${dateTo}T23:59:59.999Z`);
    }

    const include = [
      {
        model: User,
        as: 'customer',
        attributes: { exclude: ['password'] },
        required: false,
        where: search ? buildSearchWhere(search, ['fullName']) : undefined
      },
      {
        model: User,
        as: 'provider',
        attributes: { exclude: ['password'] },
        required: false,
        where: search ? buildSearchWhere(search, ['fullName']) : undefined
      },
      {
        model: Service,
        as: 'service',
        required: false
      }
    ];

    if (search) {
      where[Op.or] = [
        { serviceTitle: { [Op.like]: `%${search}%` } },
        { serviceCategory: { [Op.like]: `%${search}%` } },
        /^\d+$/.test(search) ? { id: Number(search) } : null
      ].filter(Boolean);
    }

    const orders = await Order.findAll({
      where,
      include,
      order: [['createdAt', 'DESC']],
      limit: 100
    });

    res.json({
      orders: orders.map(buildOrderResponse)
    });
  } catch (error) {
    next(error);
  }
};

exports.getOrderDetail = async (req, res, next) => {
  try {
    const order = await Order.findByPk(req.params.id, {
      include: getOrderIncludes(true)
    });

    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    res.json({
      order: buildOrderResponse(order)
    });
  } catch (error) {
    next(error);
  }
};

exports.getReports = async (req, res, next) => {
  try {
    const status = (req.query.status || '').trim();
    const search = (req.query.search || '').trim();
    const dateFrom = (req.query.dateFrom || '').trim();
    const dateTo = (req.query.dateTo || '').trim();

    const where = {
      reportMessage: { [Op.ne]: null },
      reportedAt: { [Op.ne]: null }
    };

    if (status) {
      if (status === 'open') {
        where[Op.or] = [{ reportStatus: null }, { reportStatus: 'open' }];
      } else {
        where.reportStatus = status;
      }
    }

    if (dateFrom || dateTo) {
      where.reportedAt = { [Op.ne]: null };
      if (dateFrom) where.reportedAt[Op.gte] = new Date(`${dateFrom}T00:00:00.000Z`);
      if (dateTo) where.reportedAt[Op.lte] = new Date(`${dateTo}T23:59:59.999Z`);
    }

    if (search) {
      where[Op.and] = [
        {
          [Op.or]: [
            { reportMessage: { [Op.like]: `%${search}%` } },
            { serviceTitle: { [Op.like]: `%${search}%` } },
            /^\d+$/.test(search) ? { id: Number(search) } : null
          ].filter(Boolean)
        }
      ];
    }

    const reports = await Order.findAll({
      where,
      include: getOrderIncludes(false),
      order: [['reportedAt', 'DESC']],
      limit: 100
    });

    res.json({
      reports: reports.map(buildOrderResponse)
    });
  } catch (error) {
    next(error);
  }
};

exports.getReportDetail = async (req, res, next) => {
  try {
    const order = await Order.findByPk(req.params.orderId, {
      include: getOrderIncludes(true)
    });

    if (!order || !order.reportMessage || !order.reportedAt) {
      res.status(404);
      throw new Error('Report not found');
    }

    res.json({
      report: buildOrderResponse(order)
    });
  } catch (error) {
    next(error);
  }
};

exports.reviewReport = async (req, res, next) => {
  try {
    const order = await Order.findByPk(req.params.orderId, {
      include: [
        {
          model: Service,
          as: 'service'
        }
      ]
    });

    if (!order || !order.reportMessage || !order.reportedAt) {
      res.status(404);
      throw new Error('Report not found');
    }

    const requestedStatus = (req.body.status || 'resolved').trim();
    const resolution = (req.body.resolution || req.body.action || 'no_action').trim();
    const adminNote = (req.body.adminNote || '').trim();

    if (!['open', 'reviewed', 'resolved'].includes(requestedStatus)) {
      res.status(400);
      throw new Error('Invalid report status');
    }

    if (!REPORT_RESOLUTION_VALUES.has(resolution)) {
      res.status(400);
      throw new Error('Invalid report resolution');
    }

    if (!adminNote) {
      res.status(400);
      throw new Error('Admin note is required');
    }

    if (resolution === 'provider_suspended') {
      const provider = await User.findByPk(order.providerId);
      if (provider) {
        provider.accountStatus = 'suspended';
        provider.suspensionReason = adminNote;
        provider.suspendedAt = new Date();
        
        const penalty = Number(await getPlatformSettingValue('provider_report_penalty')) || 10;
        provider.rating = Math.max(0, (Number(provider.rating) || 50) - penalty);

        const jobs = provider.jobsCompleted || 0;
        const rating = Number(provider.rating);
        if (jobs >= 100 && rating >= 95) provider.tier = 'platinum';
        else if (jobs >= 50 && rating >= 85) provider.tier = 'elite';
        else if (jobs >= 10 && rating >= 70) provider.tier = 'veteran';
        else provider.tier = 'rookie';

        await provider.save();
        await logAdminAction(req.user.id, 'user', provider.id, 'suspend_user', adminNote, {
          source: 'report_review',
          orderId: order.id
        });
      }
    } else if (resolution === 'warn_provider') {
      const provider = await User.findByPk(order.providerId);
      if (provider) {
        const penalty = Number(await getPlatformSettingValue('provider_report_penalty')) || 10;
        provider.rating = Math.max(0, (Number(provider.rating) || 50) - penalty);

        const jobs = provider.jobsCompleted || 0;
        const rating = Number(provider.rating);
        if (jobs >= 100 && rating >= 95) provider.tier = 'platinum';
        else if (jobs >= 50 && rating >= 85) provider.tier = 'elite';
        else if (jobs >= 10 && rating >= 70) provider.tier = 'veteran';
        else provider.tier = 'rookie';

        await provider.save();
        await logAdminAction(req.user.id, 'user', provider.id, 'warn_provider', adminNote, {
          source: 'report_review',
          orderId: order.id
        });
      }
    }

    if (resolution === 'customer_suspended') {
      const customer = await User.findByPk(order.customerId);
      if (customer) {
        customer.accountStatus = 'suspended';
        customer.suspensionReason = adminNote;
        customer.suspendedAt = new Date();
        
        const penalty = Number(await getPlatformSettingValue('customer_complaint_penalty')) || 2;
        customer.rating = Math.max(0, (Number(customer.rating) || 100) - penalty);

        await customer.save();
        await logAdminAction(req.user.id, 'user', customer.id, 'suspend_user', adminNote, {
          source: 'report_review',
          orderId: order.id
        });
      }
    }

    if (resolution === 'service_disabled' && order.service) {
      order.service.serviceStatus = 'disabled';
      order.service.disabledReason = adminNote;
      order.service.disabledAt = new Date();
      await order.service.save();
      
      const provider = await User.findByPk(order.providerId);
      if (provider) {
        const penalty = Number(await getPlatformSettingValue('provider_report_penalty')) || 10;
        provider.rating = Math.max(0, (Number(provider.rating) || 50) - penalty);

        const jobs = provider.jobsCompleted || 0;
        const rating = Number(provider.rating);
        if (jobs >= 100 && rating >= 95) provider.tier = 'platinum';
        else if (jobs >= 50 && rating >= 85) provider.tier = 'elite';
        else if (jobs >= 10 && rating >= 70) provider.tier = 'veteran';
        else provider.tier = 'rookie';

        await provider.save();
      }

      await logAdminAction(req.user.id, 'service', order.service.id, 'disable_service', adminNote, {
        source: 'report_review',
        orderId: order.id
      });
    }

    order.reportStatus = requestedStatus;
    order.reportResolution = resolution;
    order.adminNote = adminNote;
    order.reviewedByAdminId = req.user.id;
    order.reviewedAt = new Date();
    await order.save();

    await logAdminAction(req.user.id, 'order', order.id, 'resolve_report', adminNote, {
      reportStatus: requestedStatus,
      resolution
    });

    const reviewedOrder = await Order.findByPk(order.id, {
      include: getOrderIncludes(true)
    });

    res.json({
      message: 'Report updated successfully',
      report: buildOrderResponse(reviewedOrder)
    });
  } catch (error) {
    next(error);
  }
};

exports.disableService = async (req, res, next) => {
  try {
    const reason = (req.body.reason || '').trim();
    if (!reason) {
      res.status(400);
      throw new Error('Disable reason is required');
    }

    const service = await Service.findByPk(req.params.id);
    if (!service) {
      res.status(404);
      throw new Error('Service not found');
    }

    service.serviceStatus = 'disabled';
    service.disabledReason = reason;
    service.disabledAt = new Date();
    await service.save();

    await logAdminAction(req.user.id, 'service', service.id, 'disable_service', reason);

    res.json({
      message: 'Service disabled successfully',
      service: serializeServiceSummary(service)
    });
  } catch (error) {
    next(error);
  }
};

exports.restoreService = async (req, res, next) => {
  try {
    const service = await Service.findByPk(req.params.id);
    if (!service) {
      res.status(404);
      throw new Error('Service not found');
    }

    service.serviceStatus = 'active';
    service.disabledReason = null;
    service.disabledAt = null;
    await service.save();

    await logAdminAction(req.user.id, 'service', service.id, 'restore_service', null);

    res.json({
      message: 'Service restored successfully',
      service: serializeServiceSummary(service)
    });
  } catch (error) {
    next(error);
  }
};

exports.getSettings = async (req, res, next) => {
  try {
    await ensurePlatformSettings();
    const records = await PlatformSetting.findAll({
      include: [
        {
          model: User,
          as: 'updatedByAdmin',
          attributes: { exclude: ['password'] },
          required: false
        }
      ],
      order: [['key', 'ASC']]
    });

    res.json({
      settings: records.map((record) => ({
        key: record.key,
        value: Number.isNaN(Number(record.value)) ? record.value : Number(record.value),
        description: record.description,
        updatedAt: record.updatedAt,
        updatedByAdmin: record.updatedByAdmin ? serializeUserSummary(record.updatedByAdmin) : null
      })),
      groups: {
        ratings: SETTING_DEFINITIONS.filter((entry) => entry.key.includes('rating') || entry.key.includes('penalty')),
        operations: SETTING_DEFINITIONS.filter((entry) => !entry.key.includes('rating') && !entry.key.includes('penalty'))
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const settingsPayload = req.body.settings && typeof req.body.settings === 'object'
      ? req.body.settings
      : req.body;

    await ensurePlatformSettings();

    const updatedKeys = [];
    for (const [key, rawValue] of Object.entries(settingsPayload)) {
      if (!SETTING_KEYS.has(key)) continue;

      const normalizedValue = Number(rawValue);
      if (Number.isNaN(normalizedValue) || normalizedValue < 0) {
        res.status(400);
        throw new Error(`Invalid value supplied for ${key}`);
      }

      const setting = await PlatformSetting.findOne({ where: { key } });
      if (!setting) continue;

      setting.value = String(normalizedValue);
      setting.updatedByAdminId = req.user.id;
      await setting.save();

      updatedKeys.push(key);
      await logAdminAction(req.user.id, 'setting', setting.id, 'update_setting', null, {
        key,
        value: normalizedValue
      });
    }

    const records = await PlatformSetting.findAll({
      include: [
        {
          model: User,
          as: 'updatedByAdmin',
          attributes: { exclude: ['password'] },
          required: false
        }
      ],
      order: [['key', 'ASC']]
    });

    res.json({
      message: updatedKeys.length
        ? 'Settings updated successfully'
        : 'No valid settings were supplied',
      settings: records.map((record) => ({
        key: record.key,
        value: Number.isNaN(Number(record.value)) ? record.value : Number(record.value),
        description: record.description,
        updatedAt: record.updatedAt,
        updatedByAdmin: record.updatedByAdmin ? serializeUserSummary(record.updatedByAdmin) : null
      }))
    });
  } catch (error) {
    next(error);
  }
};

exports.sendCustomEmail = async (req, res, next) => {
  try {
    const to = (req.body.to || req.body.email || '').trim().toLowerCase();
    const subject = (req.body.subject || '').trim();
    const message = (req.body.message || '').trim();

    if (!to) {
      res.status(400);
      throw new Error('Destination email is required');
    }

    if (!isValidEmailAddress(to)) {
      res.status(400);
      throw new Error('Destination email is invalid');
    }

    if (!subject) {
      res.status(400);
      throw new Error('Subject is required');
    }

    if (!message) {
      res.status(400);
      throw new Error('Message is required');
    }

    const result = await sendCustomAdminEmail({
      to,
      subject,
      message
    });

    await logAdminAction(req.user.id, 'email', 0, 'send_custom_email', subject, {
      to,
      subject,
      messageLength: message.length,
      sendPulseMessageId: result?.message_id || result?.id || null
    });

    res.json({
      message: 'Custom email sent successfully'
    });
  } catch (error) {
    next(error);
  }
};
