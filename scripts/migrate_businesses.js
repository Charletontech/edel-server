const { User, Service, Business } = require('../models');
const sequelize = require('../config/database');

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');
    
    // Ensure tables are updated
    await sequelize.sync({ alter: true });
    
    const services = await Service.findAll({
      where: { businessId: null }
    });
    
    if (services.length === 0) {
      console.log('No orphaned services found.');
      return;
    }
    
    console.log(`Found ${services.length} orphaned services.`);
    
    // Group services by provider
    const providerServices = {};
    for (const service of services) {
      if (!providerServices[service.userId]) {
        providerServices[service.userId] = [];
      }
      providerServices[service.userId].push(service);
    }
    
    let businessesCreated = 0;
    
    for (const [providerId, provServices] of Object.entries(providerServices)) {
      // Check if they already have a "My Business"
      let business = await Business.findOne({
        where: { providerId, name: 'My Business' }
      });
      
      if (!business) {
        business = await Business.create({
          providerId,
          name: 'My Business',
          businessType: 'Service', // Defaulting to service
          category: provServices[0].category // Taking category from their first service
        });
        businessesCreated++;
      }
      
      for (const service of provServices) {
        service.businessId = business.id;
        await service.save();
      }
    }
    
    console.log(`Migration complete. Created ${businessesCreated} businesses and linked services.`);
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
