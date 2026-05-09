const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: process.env.DB_HOST,
    port: 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const r = await c.query('SELECT COUNT(*)::int AS rows, COUNT(api_key_encrypted)::int AS encrypted FROM ai_configurations');
  console.log('AI_AUDIT', JSON.stringify(r.rows[0]));
  await c.end();
})().catch((e) => { console.error('AI_AUDIT_ERR', e.message); process.exit(1); });
