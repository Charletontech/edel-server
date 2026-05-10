const User = require('./User');
const Service = require('./Service');
const Order = require('./Order');
const Session = require('./Session');
const Verification = require('./Verification');

// Associations
User.hasMany(Service, { foreignKey: 'userId', as: 'services' });
Service.belongsTo(User, { foreignKey: 'userId', as: 'provider' });
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

module.exports = {
  User,
  Service,
  Order,
  Session,
  Verification
};
