const User = require('./User');
const Service = require('./Service');
const Order = require('./Order');
const Session = require('./Session');
const Verification = require('./Verification');
const PlatformSetting = require('./PlatformSetting');
const AdminActionLog = require('./AdminActionLog');
const Transaction = require('./Transaction');
const Category = require('./Category');

// Associations
User.hasMany(Service, { foreignKey: 'userId', as: 'services' });
Service.belongsTo(User, { foreignKey: 'userId', as: 'provider' });
User.hasMany(Transaction, { foreignKey: 'userId', as: 'transactions' });
Transaction.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Order, { foreignKey: 'customerId', as: 'customerOrders' });
User.hasMany(Order, { foreignKey: 'providerId', as: 'providerOrders' });
Order.belongsTo(User, { foreignKey: 'customerId', as: 'customer' });
Order.belongsTo(User, { foreignKey: 'providerId', as: 'provider' });
Service.hasMany(Order, { foreignKey: 'serviceId', as: 'orders' });
Order.belongsTo(Service, { foreignKey: 'serviceId', as: 'service' });
Order.hasMany(Session, { foreignKey: 'orderId', as: 'sessions' });
Session.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
User.hasMany(Session, { foreignKey: 'customerId', as: 'verificationSessions' });
Session.belongsTo(User, { foreignKey: 'customerId', as: 'customer' });
Order.hasMany(Verification, { foreignKey: 'orderId', as: 'verifications' });
Verification.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
User.hasMany(Verification, { foreignKey: 'providerId', as: 'verifications' });
Verification.belongsTo(User, { foreignKey: 'providerId', as: 'provider' });
Session.hasOne(Verification, { foreignKey: 'sessionId', sourceKey: 'sessionId', as: 'verification' });
Verification.belongsTo(Session, { foreignKey: 'sessionId', targetKey: 'sessionId', as: 'session' });
Order.belongsTo(User, { foreignKey: 'reviewedByAdminId', as: 'reviewedByAdmin' });
User.hasMany(Order, { foreignKey: 'reviewedByAdminId', as: 'reviewedOrders' });
PlatformSetting.belongsTo(User, { foreignKey: 'updatedByAdminId', as: 'updatedByAdmin' });
User.hasMany(PlatformSetting, { foreignKey: 'updatedByAdminId', as: 'updatedSettings' });
AdminActionLog.belongsTo(User, { foreignKey: 'adminUserId', as: 'adminUser' });
User.hasMany(AdminActionLog, { foreignKey: 'adminUserId', as: 'adminActions' });

module.exports = {
  User,
  Service,
  Order,
  Session,
  Verification,
  PlatformSetting,
  AdminActionLog,
  Transaction,
  Category
};
