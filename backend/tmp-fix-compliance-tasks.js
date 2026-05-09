const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME || 'statcompy',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  console.log('Connected.');

  const sql = `
    ALTER TABLE compliance_tasks ADD COLUMN IF NOT EXISTS period_year         int NOT NULL DEFAULT 2026;
    ALTER TABLE compliance_tasks ADD COLUMN IF NOT EXISTS period_month        int NULL;
    ALTER TABLE compliance_tasks ADD COLUMN IF NOT EXISTS period_label        varchar(30) NULL;
    ALTER TABLE compliance_tasks ADD COLUMN IF NOT EXISTS assigned_by_user_id uuid NULL;
    ALTER TABLE compliance_tasks ADD COLUMN IF NOT EXISTS remarks             text NULL;
    ALTER TABLE compliance_tasks ADD COLUMN IF NOT EXISTS last_notified_at    timestamp NULL;
    ALTER TABLE compliance_tasks ADD COLUMN IF NOT EXISTS escalated_at        timestamp NULL;
  `;

  for (const stmt of sql.split(';').map(s => s.trim()).filter(Boolean)) {
    console.log('RUN:', stmt.substring(0, 80));
    await c.query(stmt);
    console.log('  OK');
  }

  // Verify
  const res = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'compliance_tasks'
    ORDER BY ordinal_position
  `);
  console.log('\nCompliance_tasks columns:');
  res.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type}, nullable=${r.is_nullable})`));

  await c.end();
  console.log('\nDone.');
})().catch(e => { console.error(e); process.exit(1); });
