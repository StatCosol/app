const { Client } = require('pg');
const client = new Client({
  host: 'statcompy-db.postgres.database.azure.com',
  port: 5432,
  user: 'Statcocompy',
  password: 'Statco@123',
  database: 'statcompy',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  const r1 = await client.query(`SELECT u.id, u.name, u.email, u.client_id, u.is_active FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'CONTRACTOR' LIMIT 10`);
  console.log('CONTRACTOR users:', JSON.stringify(r1.rows, null, 2));
  const r2 = await client.query('SELECT COUNT(*) as cnt FROM branch_contractor');
  console.log('branch_contractor rows:', r2.rows[0].cnt);
  await client.end();
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
