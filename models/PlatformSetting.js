const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PlatformSetting = sequelize.define('PlatformSetting', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  key: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  value: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.STRING,
    allowNull: true
  },
  updatedByAdminId: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
});

module.exports = PlatformSetting;
