const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  customerId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  providerId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  serviceId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  serviceTitle: {
    type: DataTypes.STRING,
    allowNull: false
  },
  serviceCategory: {
    type: DataTypes.STRING,
    allowNull: false
  },
  basePrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  customerLocationLabel: {
    type: DataTypes.STRING,
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
  status: {
    type: DataTypes.ENUM('pending', 'accepted', 'in_progress', 'declined', 'cancelled', 'completed'),
    allowNull: false,
    defaultValue: 'pending'
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  acceptedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  declinedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  cancelledAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  cancellationReason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  completionToken: {
    type: DataTypes.STRING,
    allowNull: true
  },
  completionTokenExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  reportMessage: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  reportedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  reportStatus: {
    type: DataTypes.ENUM('open', 'reviewed', 'resolved'),
    allowNull: true
  },
  reportResolution: {
    type: DataTypes.STRING,
    allowNull: true
  },
  adminNote: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  reviewedByAdminId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  reviewedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  indexes: [
    { fields: ['customerId'] },
    { fields: ['providerId'] },
    { fields: ['serviceId'] },
    { fields: ['status'] },
    { fields: ['reportStatus'] },
    { fields: ['createdAt'] }
  ]
});

module.exports = Order;
