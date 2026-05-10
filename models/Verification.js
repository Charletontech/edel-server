const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Verification = sequelize.define('Verification', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  sessionId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  providerId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  providerLat: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: false
  },
  providerLng: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: false
  },
  providerAccuracy: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  distance: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: false
  },
  verifiedAt: {
    type: DataTypes.DATE,
    allowNull: false
  }
}, {
  indexes: [
    { fields: ['sessionId'] },
    { fields: ['orderId'] },
    { fields: ['providerId'] },
    { fields: ['verifiedAt'] }
  ]
});

module.exports = Verification;
