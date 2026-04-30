/**
 * Run a SQL migration file against the production database.
 * Usage: node scripts/run-migration.js <filename>
 *
 * Reads DB connection from environment variables:
 *   DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME, DB_SSL
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/run-migration.js <filename>');
    process.exit(1);
  }

  const filePath = path.resolve(__dirname, '..', 'migrations', file);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(filePath, 'utf8');
  console.log(`Running migration: ${file} (${sql.length} bytes)`);

  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    console.log('Connected to database');
    const result = await client.query(sql);
    console.log('Migration completed successfully');
    if (result && result.rowCount !== undefined) {
      console.log(`Rows affected: ${result.rowCount}`);
    }
  } catch (err) {
    console.error('Migration failed:', err.message);
    if (err.detail) console.error('Detail:', err.detail);
    if (err.where) console.error('Where:', err.where);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
