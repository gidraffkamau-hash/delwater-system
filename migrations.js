/**
 * ╔══════════════════════════════════════════════════╗
 * ║       DELWATER — Database Migration Script       ║
 * ║  Run with: npm run migrate                       ║
 * ╚══════════════════════════════════════════════════╝
 *
 * Creates the orders table in PostgreSQL if it does not already exist.
 * Requires the DATABASE_URL environment variable to be set.
 */

const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌  DATABASE_URL environment variable is not set.');
  process.exit(1);
}

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const CREATE_ORDERS_TABLE = `
  CREATE TABLE IF NOT EXISTS orders (
    id           SERIAL PRIMARY KEY,
    product_name TEXT,
    amount       INTEGER,
    phone        TEXT,
    status       TEXT,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

async function migrate() {
  try {
    await client.connect();
    console.log('✅  Connected to PostgreSQL.');

    await client.query(CREATE_ORDERS_TABLE);
    console.log('✅  Migration complete: orders table is ready.');
  } catch (err) {
    console.error('❌  Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌  Database connection closed.');
  }
}

migrate();
