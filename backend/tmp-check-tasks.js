const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: process.env.DB_HOST || 'statcompy-db.postgres.database.azure.com',
    port: +(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'Statcocompy',
    password: process.env.DB_PASS || 'Statco@123',
    database: process.env.DB_NAME || 'statcompy',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const r1 = await c.query('SELECT period_year, period_month, COUNT(*)::int as cnt FROM compliance_tasks GROUP BY period_year, period_month ORDER BY 1 DESC, 2 DESC');
  console.log('=== Tasks by month ===');
  console.table(r1.rows);

  const r2 = await c.query('SELECT DISTINCT ct.client_id, c.company_name, ct.branch_id, b.branchname FROM compliance_tasks ct JOIN clients c ON c.id = ct.client_id JOIN client_branches b ON b.id = ct.branch_id');
  console.log('=== Clients/Branches with tasks ===');
  console.table(r2.rows);

  const r3 = await c.query("SELECT id, code, compliance_name, frequency FROM compliance_master WHERE is_active = true AND frequency = 'MONTHLY' ORDER BY code");
  console.log('=== Monthly compliance masters ===');
  console.table(r3.rows);

  const r4 = await c.query('SELECT id, branchname, client_id FROM client_branches WHERE is_active = true ORDER BY branchname');
  console.log('=== Active branches ===');
  console.table(r4.rows);

  const r5 = await c.query("SELECT u.id, u.name, r.code as role FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'CRM' AND u.is_active = true AND u.deleted_at IS NULL");
  console.log('=== Active CRM users ===');
  console.table(r5.rows);

  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
