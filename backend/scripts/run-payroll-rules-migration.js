// Quick migration runner for payroll rules config
// Usage: node scripts/run-payroll-rules-migration.js
const { Client } = require('pg');

const SQL = `
ALTER TABLE payroll_client_setup
  ADD COLUMN IF NOT EXISTS pf_gross_threshold numeric(14,2) DEFAULT 0;

-- Telangana PT slabs for all PT-enabled clients
INSERT INTO payroll_statutory_slabs (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
SELECT gen_random_uuid(), cs.client_id, 'TS', 'PT', 0, 15000, 0, NOW()
FROM payroll_client_setup cs
WHERE cs.pt_enabled = true
  AND NOT EXISTS (
    SELECT 1 FROM payroll_statutory_slabs s
    WHERE s.client_id = cs.client_id AND s.state_code = 'TS' AND s.component_code = 'PT' AND s.from_amount = 0
  );

INSERT INTO payroll_statutory_slabs (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
SELECT gen_random_uuid(), cs.client_id, 'TS', 'PT', 15001, 20000, 150, NOW()
FROM payroll_client_setup cs
WHERE cs.pt_enabled = true
  AND NOT EXISTS (
    SELECT 1 FROM payroll_statutory_slabs s
    WHERE s.client_id = cs.client_id AND s.state_code = 'TS' AND s.component_code = 'PT' AND s.from_amount = 15001
  );

INSERT INTO payroll_statutory_slabs (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
SELECT gen_random_uuid(), cs.client_id, 'TS', 'PT', 20001, NULL, 200, NOW()
FROM payroll_client_setup cs
WHERE cs.pt_enabled = true
  AND NOT EXISTS (
    SELECT 1 FROM payroll_statutory_slabs s
    WHERE s.client_id = cs.client_id AND s.state_code = 'TS' AND s.component_code = 'PT' AND s.from_amount = 20001
  );
`;

async function main() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASS || process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    const statements = SQL.split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      console.log('Running:', stmt.substring(0, 80) + '...');
      const result = await client.query(stmt);
      console.log('  rows affected:', result.rowCount);
    }

    console.log('Migration complete!');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
