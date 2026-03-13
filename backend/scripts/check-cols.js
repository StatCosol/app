const { Client } = require('pg');
const c = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'changeme',
  database: process.env.DB_NAME || 'statcompy',
});

(async () => {
  await c.connect();
  const tables = ['compliance_doc_library', 'safety_documents', 'audits', 'compliance_returns', 'registers_records'];
  for (const t of tables) {
    const r = await c.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position",
      [t]
    );
    console.log(`\n=== ${t} ===`);
    console.log(r.rows.map(x => x.column_name).join(', '));
  }
  await c.end();
})();
