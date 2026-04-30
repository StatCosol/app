const { Client } = require('pg');
const c = new Client({
  host: 'statcompy-db.postgres.database.azure.com',
  database: 'statcompydb',
  user: 'statcompyadmin',
  password: 'Statcompy@2026',
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await c.connect();
  const r1 = await c.query(
    "UPDATE client_branches SET branch_code='HYD-001' WHERE id='94ad1c42-ea05-460e-b494-0a7e634de127'"
  );
  console.log('Branch updated:', r1.rowCount);

  const r2 = await c.query(
    "UPDATE employee_sequence SET branch_code='HYD' WHERE branch_code='BRM' AND client_id='b0f71c41-5a0c-4dc5-9204-fa0bb1455f4d'"
  );
  console.log('Sequence updated:', r2.rowCount);

  await c.end();
})();
