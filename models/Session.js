const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Session = sequelize.define('Session', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  sessionId: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true
  },
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  customerId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  token: {
    type: DataTypes.STRING(128),
    allowNull: false
  },
  customerLat: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: false
  },
  customerLng: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: false
  },
  customerAccuracy: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'started'),
    allowNull: false,
    defaultValue: 'pending'
  },
  verifiedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  indexes: [
    { fields: ['orderId'] },
    { fields: ['customerId'] },
    { fields: ['status'] },
    { fields: ['expiresAt'] }
  ]
});

module.exports = Session;
