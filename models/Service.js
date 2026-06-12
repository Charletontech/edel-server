const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Service = sequelize.define('Service', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  basePrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  businessPhoto: {
    type: DataTypes.STRING,
    allowNull: true
  },
  isDefault: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  serviceStatus: {
    type: DataTypes.ENUM('active', 'disabled'),
    allowNull: false,
    defaultValue: 'active'
  },
  disabledReason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  disabledAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  indexes: [
    { fields: ['userId'] },
    { fields: ['serviceStatus'] },
    { fields: ['category'] },
    { fields: ['title'] }
  ]
});

module.exports = Service;
