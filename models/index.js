const User = require('./User');
const Service = require('./Service');

// Associations
User.hasMany(Service, { foreignKey: 'userId', as: 'services' });
Service.belongsTo(User, { foreignKey: 'userId', as: 'provider' });

module.exports = {
  User,
  Service
};
