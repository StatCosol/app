const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const sqlPath = path.resolve(
  __dirname,
  '..',
  'migrations',
  '20260507_audit_preliminary_and_vendor_window.sql',
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
    const a = await c.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name='audits'
          AND column_name IN ('preliminary_published_at','preliminary_published_by_user_id','preliminary_findings_count','vendor_window_days')
        ORDER BY column_name`,
    );
    const n = await c.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name='audit_non_compliances'
          AND column_name IN ('published_at','vendor_window_until','is_recurring','original_nc_id','recurrence_count','finding_signature')
        ORDER BY column_name`,
    );
    console.log(JSON.stringify({
      ok: true,
      auditsCols: a.rows.map((r) => r.column_name),
      ncCols: n.rows.map((r) => r.column_name),
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
