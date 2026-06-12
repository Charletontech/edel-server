const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Category = sequelize.define('Category', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  iconName: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'package'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  indexes: [
    { fields: ['isActive'] },
    { fields: ['name'] }
  ]
});

module.exports = Category;
