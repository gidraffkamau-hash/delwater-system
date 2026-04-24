require('dotenv').config();
const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

async function migrate() {
  const client = new Client({
    connectionString: DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    await client.query(`
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        ref TEXT UNIQUE,
        customer_name TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        city TEXT,
        items JSONB,
        total INTEGER,
        payment TEXT,
        delivery_date TEXT,
        notes TEXT,
        status TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Migration completed');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await client.end();
  }
}

migrate();