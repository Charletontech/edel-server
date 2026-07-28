const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AtlasCheckout = sequelize.define('AtlasCheckout', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  transactionId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  sourceReference: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  checkoutReference: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  checkoutUrl: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'NGN'
  },
  status: {
    type: DataTypes.ENUM('pending', 'success', 'failed'),
    allowNull: false,
    defaultValue: 'pending'
  },
  initiatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  verifiedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  rawInitiateResponse: {
    type: DataTypes.JSON,
    allowNull: true
  },
  rawVerifyResponse: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  indexes: [
    { fields: ['userId'] },
    { fields: ['transactionId'] },
    { fields: ['sourceReference'] },
    { fields: ['checkoutReference'] },
    { fields: ['status'] }
  ]
});

module.exports = AtlasCheckout;
