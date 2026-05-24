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
    validate: {
      isEmail: true
    }
  },
  phoneNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  locationLabel: {
    type: DataTypes.STRING,
    allowNull: true
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true
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
  hasPaidAccessFee: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  availabilityStatus: {
    type: DataTypes.ENUM('available', 'busy', 'unavailable'),
    defaultValue: 'available'
  },
  profilePhoto: {
    type: DataTypes.STRING,
    allowNull: true
  },
  accountStatus: {
    type: DataTypes.ENUM('active', 'suspended'),
    allowNull: false,
    defaultValue: 'active'
  },
  suspensionReason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  suspendedAt: {
    type: DataTypes.DATE,
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
  },
  passwordResetTokenHash: {
    type: DataTypes.STRING,
    allowNull: true
  },
  passwordResetExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  indexes: [
    { unique: true, fields: ['email'] },
    { fields: ['role'] },
    { fields: ['accountStatus'] },
    { fields: ['availabilityStatus'] },
    { fields: ['latitude'] },
    { fields: ['longitude'] },
    { fields: ['passwordResetTokenHash'] }
  ],
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
