const path = require('path');
const { Client } = require(path.join(__dirname, 'backend', 'node_modules', 'pg'));

require(path.join(__dirname, 'backend', 'node_modules', 'dotenv')).config({
  path: path.join(__dirname, 'backend', '.env'),
});

const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'];
const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const c = new Client({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 5432),
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});
c.connect()
  .then(() => c.query('SELECT COUNT(*) as cnt FROM contractor_documents'))
  .then(r => {
    console.log('Total contractor_documents:', r.rows[0].cnt);
    return c.query("SELECT COUNT(*) as cnt FROM contractor_documents WHERE client_id = 'b0f71c41-5a0c-4dc5-9204-fa0bb1455f4d'");
  })
  .then(r => {
    console.log('LMSPL contractor_documents:', r.rows[0].cnt);
    return c.query("SELECT client_id, c.client_name, COUNT(*) as cnt FROM contractor_documents cd JOIN clients c ON c.id = cd.client_id GROUP BY client_id, c.client_name ORDER BY cnt DESC LIMIT 5");
  })
  .then(r => {
    console.log('Top clients with docs:', r.rows);
    c.end();
  })
  .catch(e => { console.error(e.message); c.end(); });
