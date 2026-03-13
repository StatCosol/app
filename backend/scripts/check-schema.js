const { DataSource } = require('typeorm');

const ds = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'changeme',
  database: process.env.DB_NAME || 'statcompy',
  ssl: false,
});

ds.initialize().then(async () => {
  const tables = [
    'clients', 'client_branches', 'users',
    'compliance_doc_library', 'safety_documents', 'branch_documents',
    'audits', 'audit_observations',
    'compliance_returns', 'registers_records',
    'compliance_tasks', 'deletion_requests',
  ];
  for (const t of tables) {
    const cols = await ds.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = '${t}' ORDER BY ordinal_position`
    );
    if (cols.length) {
      console.log(`\n=== ${t} ===`);
      console.log(cols.map(c => c.column_name).join(', '));
    } else {
      console.log(`\n=== ${t} === NOT FOUND`);
    }
  }
  await ds.destroy();
}).catch(e => {
  console.error('Connection error:', e.message);
  process.exit(1);
});
