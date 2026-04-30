const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'statcompy-db.postgres.database.azure.com',
    user: 'Statcocompy',
    password: 'Statco@123',
    database: 'statcompy',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  const r = await c.query(`SELECT id, emp_code, CONCAT(first_name, ' ', last_name) as name, date_of_joining
    FROM employees WHERE client_id = 'b0f71c41-5a0c-4dc5-9204-fa0bb1455f4d' ORDER BY emp_code`);
  for (const row of r.rows) {
    console.log(row.emp_code + ' | ' + row.name + ' | DOJ=' + (row.date_of_joining ? row.date_of_joining.toISOString().slice(0,10) : 'null') + ' | id=' + row.id);
  }
  await c.end();
})();
