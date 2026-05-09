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

  // Check compliance_documents columns
  let r = await c.query(`SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'compliance_documents'
    ORDER BY ordinal_position`);
  console.log('=== COMPLIANCE_DOCUMENTS COLUMNS ===');
  r.rows.forEach(x => console.log(`  ${x.column_name}  [${x.data_type}]  default=${x.column_default}  nullable=${x.is_nullable}`));

  // Check clients columns related to crm_on_behalf
  r = await c.query(`SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'crm_on_behalf_enabled'`);
  console.log('\n=== CLIENTS.crm_on_behalf_enabled ===');
  r.rows.forEach(x => console.log(`  ${x.column_name}  [${x.data_type}]  default=${x.column_default}  nullable=${x.is_nullable}`));

  // Count clients with crm_on_behalf_enabled = true/false
  r = await c.query(`SELECT crm_on_behalf_enabled, COUNT(*) FROM clients GROUP BY crm_on_behalf_enabled`);
  console.log('\n=== CLIENTS crm_on_behalf_enabled distribution ===');
  r.rows.forEach(x => console.log(`  ${x.crm_on_behalf_enabled}: ${x.count} clients`));

  // Sample compliance_documents to see acting_on_behalf usage
  r = await c.query(`SELECT id, uploaded_by_role, acting_on_behalf, original_owner_role
    FROM compliance_documents
    WHERE acting_on_behalf = true
    LIMIT 10`);
  console.log('\n=== COMPLIANCE_DOCUMENTS uploaded on behalf (sample) ===');
  if (r.rows.length === 0) console.log('  (none yet)');
  r.rows.forEach(x => console.log('  ' + JSON.stringify(x)));

  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
