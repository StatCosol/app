const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const sqlPath = path.resolve(
  __dirname,
  '..',
  'migrations',
  '20260507_audit_remark_master.sql',
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
      "SELECT COUNT(*)::int AS c FROM information_schema.tables WHERE table_name = 'audit_remark_master'",
    );
    const idx = await c.query(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'audit_remark_master'",
    );
    console.log(JSON.stringify({
      ok: true,
      tableExists: r.rows[0].c === 1,
      indexes: idx.rows.map((x) => x.indexname),
    }, null, 2));
    await c.end();
    process.exit(0);
  } catch (e) {
    console.error('Migration FAILED:', e.message);
    try { await c.query('ROLLBACK'); } catch {}
    await c.end();
    process.exit(1);
  }
})();
