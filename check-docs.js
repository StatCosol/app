const path = require('path');
const { Client } = require(path.join(__dirname, 'backend', 'node_modules', 'pg'));
const c = new Client({
  host: 'statcompy-db.postgres.database.azure.com',
  user: 'Statcocompy',
  password: 'Statco@123',
  database: 'statcompy',
  ssl: { rejectUnauthorized: false },
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
