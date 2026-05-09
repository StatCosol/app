const { Client } = require('pg');
const c = new Client({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
});
c.connect()
  .then(() => c.query('ALTER TABLE clients ADD COLUMN IF NOT EXISTS crm_on_behalf_enabled BOOLEAN NOT NULL DEFAULT false'))
  .then((r) => { console.log('Migration OK, command tag:', r.command); c.end(); process.exit(0); })
  .catch((e) => { console.error('Migration FAILED:', e.message); c.end(); process.exit(1); });
