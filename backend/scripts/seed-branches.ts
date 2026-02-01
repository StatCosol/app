
import dataSource from '../src/typeorm.datasource';
import { v4 as uuidv4 } from 'uuid';

async function run() {
  const ds = dataSource;
  await ds.initialize();
  try {
    // Fetch client_id for a known client_code
    const clientCode = 'VEIPL'; // Change if you want a different client
    const clientRes = await ds.query('SELECT id FROM clients WHERE client_code = $1 LIMIT 1', [clientCode]);
    if (!clientRes.length) {
      throw new Error(`No client found with client_code '${clientCode}'`);
    }
    const clientId = clientRes[0].id;

    const seedSql = `
    BEGIN;
    INSERT INTO branches (id, branch_code, branch_name, branch_type, client_id, branch_category, is_active, is_deleted)
    VALUES
      ('${uuidv4()}', 'BR001', 'Head Office', 'HO', '${clientId}', 'CORPORATE', true, false),
      ('${uuidv4()}', 'BR002', 'Zonal Office', 'ZONAL', '${clientId}', 'REGIONAL', true, false),
      ('${uuidv4()}', 'BR003', 'Sales Branch', 'SALES', '${clientId}', 'SALES', true, false)
    ON CONFLICT (branch_code) DO NOTHING;
    COMMIT;
    `;
    await ds.query(seedSql);
    console.log('Seeded sample branches for client_code', clientCode);
  } finally {
    await ds.destroy();
  }
}

run().catch((err) => {
  console.error('Seeding branches failed', err);
  process.exit(1);
});
