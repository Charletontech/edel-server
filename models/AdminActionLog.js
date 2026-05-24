const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AdminActionLog = sequelize.define('AdminActionLog', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  adminUserId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  targetType: {
    type: DataTypes.ENUM('user', 'service', 'order', 'setting'),
    allowNull: false
  },
  targetId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  actionType: {
    type: DataTypes.STRING,
    allowNull: false
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  metadataJson: {
    type: DataTypes.TEXT,
    allowNull: true
  }
});

module.exports = AdminActionLog;
