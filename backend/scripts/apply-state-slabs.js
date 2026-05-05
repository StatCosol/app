const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const sqlPath = path.resolve(
  __dirname,
  '..',
  'migrations',
  '20260508_state_pt_lwf_global_slabs.sql',
);
const sql = fs.readFileSync(sqlPath, 'utf8');

const c = new Client({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  try {
    await c.connect();
    await c.query('BEGIN');
    await c.query(sql);
    await c.query('COMMIT');
    const r = await c.query(
      "SELECT state_code, component_code, COUNT(*) AS slabs FROM payroll_statutory_slabs WHERE client_id = '00000000-0000-0000-0000-000000000000' GROUP BY state_code, component_code ORDER BY state_code, component_code",
    );
    console.log('Migration OK. Seeded shared slab rows:');
    console.table(r.rows);
    process.exit(0);
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch (_) {}
    console.error('Migration FAILED:', e.message);
    process.exit(1);
  } finally {
    try { await c.end(); } catch (_) {}
  }
})();
