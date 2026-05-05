const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  fullName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  phoneNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('customer', 'provider', 'both', 'admin'),
    defaultValue: 'customer'
  },
  serviceCategory: {
    type: DataTypes.STRING,
    allowNull: true
  },
  serviceTitle: {
    type: DataTypes.STRING,
    allowNull: true
  },
  basePrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  serviceDescription: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  tier: {
    type: DataTypes.ENUM('rookie', 'veteran', 'elite', 'platinum'),
    defaultValue: 'rookie'
  },
  rating: {
    type: DataTypes.FLOAT,
    defaultValue: 50.0 // Providers start at 50, Customers at 100 (logic in controller)
  },
  jobsCompleted: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  availabilityStatus: {
    type: DataTypes.ENUM('available', 'busy', 'unavailable'),
    defaultValue: 'available'
  },
  profilePhoto: {
    type: DataTypes.STRING,
    allowNull: true
  },
  pushNotifications: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  emailAlerts: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  smsUpdates: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      }
      // Set initial rating based on role
      if (user.role === 'customer') {
        user.rating = 100.0;
      } else {
        user.rating = 50.0;
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      }
    }
  }
});

User.prototype.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = User;
