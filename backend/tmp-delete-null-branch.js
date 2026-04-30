const { Client } = require('pg');
const c = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
});

c.connect().then(async () => {
  // First show what we'll delete
  const check = await c.query(
    "SELECT id, name, client_id, employee_code FROM employees WHERE branch_id IS NULL ORDER BY created_at DESC"
  );
  console.log('Employees with NULL branchId:', check.rowCount);
  check.rows.forEach(r => console.log(`  ${r.employee_code} | ${r.name} | client=${r.client_id}`));

  // Delete them
  const del = await c.query("DELETE FROM employees WHERE branch_id IS NULL");
  console.log('Deleted:', del.rowCount);

  await c.end();
}).catch(e => { console.error(e); process.exit(1); });
