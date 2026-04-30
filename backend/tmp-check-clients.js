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
  const r = await c.query(
    "SELECT u.id, u.name, u.email, u.client_id, u.user_type, r.code as role_code FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'CLIENT' AND u.is_active = true AND u.deleted_at IS NULL"
  );
  console.table(r.rows);
  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
