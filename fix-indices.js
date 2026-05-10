const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixIndices() {
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
  });

  console.log("Connected to DB");

  const [tables] = await connection.execute("SHOW TABLES");
  
  for (const row of tables) {
    const tableName = Object.values(row)[0];
    const [indexes] = await connection.execute(`SHOW INDEX FROM \`${tableName}\``);
    
    const indexNames = indexes.map(idx => idx.Key_name);
    // Find duplicates: names that look like column_name_2, column_name_3, or email_something
    // Let's just group by column name and drop duplicates
    // But a unique index might have a generated name like email, email_2, etc.
    const keyPrefixes = ['email', 'sessionId', 'customer_id', 'provider_id', 'order_id'];
    
    for (const key of indexNames) {
      if (key !== 'PRIMARY') {
        // If it ends with a number or just has multiple copies. Let's just look for regex pattern
        if (/_\d+$/.test(key) || key.startsWith('email_') || key.startsWith('sessionId_') || key.startsWith('Users_') || key.startsWith('Sessions_')) {
          console.log(`Dropping index ${key} from ${tableName}`);
          try {
            await connection.execute(`ALTER TABLE \`${tableName}\` DROP INDEX \`${key}\``);
          } catch (e) {
             console.log(`Failed to drop ${key}:`, e.message);
          }
        }
      }
    }
  }

  await connection.end();
  console.log("Done");
}

fixIndices().catch(console.error);