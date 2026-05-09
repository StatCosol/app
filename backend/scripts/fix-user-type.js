const { Client } = require('pg');
const c = new Client({
  host: process.env.DB_HOST,
  port: +process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  await c.connect();

  const r1 = await c.query(`
    UPDATE users u SET user_type = 'BRANCH'
    WHERE u.user_type IS NULL
      AND u.deleted_at IS NULL
      AND u.role_id = (SELECT id FROM roles WHERE code = 'CLIENT' LIMIT 1)
      AND EXISTS (SELECT 1 FROM user_branches ub WHERE ub.user_id = u.id)
  `);
  console.log('BRANCH updated:', r1.rowCount);

  const r2 = await c.query(`
    UPDATE users u SET user_type = 'MASTER'
    WHERE u.user_type IS NULL
      AND u.deleted_at IS NULL
      AND u.role_id = (SELECT id FROM roles WHERE code = 'CLIENT' LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM user_branches ub WHERE ub.user_id = u.id)
  `);
  console.log('MASTER updated:', r2.rowCount);

  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });
