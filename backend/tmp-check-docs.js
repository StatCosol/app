const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'statcompy-db.postgres.database.azure.com',
    port: 5432,
    user: 'Statcocompy',
    password: 'Statco@123',
    database: 'statcompy',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // Check if table exists
  const tables = await c.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%compliance_doc%'`
  );
  console.log('Tables matching compliance_doc:', tables.rows);

  if (tables.rows.length > 0) {
    const r = await c.query('SELECT COUNT(*)::int as total FROM compliance_doc_library WHERE is_deleted=false');
    console.log('Total docs:', r.rows[0].total);

    const r2 = await c.query('SELECT category, COUNT(*)::int as cnt FROM compliance_doc_library WHERE is_deleted=false GROUP BY category');
    console.table(r2.rows);
  } else {
    console.log('Table does not exist!');
  }

  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
