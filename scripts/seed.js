const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { User } = require('../models');
const sequelize = require('../config/database');

const seedAdmin = async () => {
  console.log('--- Edel Admin Seeder ---');
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('✔ Database connection established.');

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminFullName = process.env.ADMIN_FULL_NAME || 'System Admin';
    const adminPhone = process.env.ADMIN_PHONE || '08000000000';

    if (!adminEmail || !adminPassword) {
      console.error('✘ Error: ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env file.');
      process.exit(1);
    }

    // Check if admin already exists
    const adminExists = await User.findOne({ where: { email: adminEmail.trim().toLowerCase() } });

    if (adminExists) {
      console.log(`ℹ Admin with email ${adminEmail} already exists.`);
      
      // Ensure the role is set to admin
      if (adminExists.role !== 'admin') {
        console.log(`⚠ User found but role is "${adminExists.role}". Promoting to admin...`);
        adminExists.role = 'admin';
        await adminExists.save();
        console.log('✔ User promoted to admin successfully.');
      } else {
        console.log('✔ User is already an admin. No changes made.');
      }
    } else {
      console.log(`⌛ Creating new admin user: ${adminFullName} (${adminEmail})...`);
      
      await User.create({
        fullName: adminFullName,
        email: adminEmail.trim().toLowerCase(),
        password: adminPassword,
        phoneNumber: adminPhone,
        role: 'admin',
        accountStatus: 'active'
      });
      
      console.log('✔ Admin user created successfully.');
    }

    console.log('--- Seeding Complete ---');
    process.exit(0);
  } catch (error) {
    console.error('✘ Seeding failed:', error.message);
    if (process.env.NODE_ENV === 'development') {
      console.error(error);
    }
    process.exit(1);
  }
};

seedAdmin();
