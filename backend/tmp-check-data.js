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

  // First discover columns
  var r = await c.query('SELECT column_name FROM information_schema.columns WHERE table_name=$$client_branches$$ ORDER BY ordinal_position');
  console.log('=== CLIENT_BRANCHES COLUMNS ===');
  r.rows.forEach(x => console.log('  ' + x.column_name));

  // Then get all data
  r = await c.query('SELECT * FROM client_branches');
  console.log('\n=== CLIENT_BRANCHES DATA ===');
  r.rows.forEach(x => console.log('  ' + JSON.stringify(x)));

  r = await c.query('SELECT id, code, compliance_name, frequency FROM compliance_master WHERE is_active = true ORDER BY frequency, code');
  console.log('\n=== ALL ACTIVE COMPLIANCE MASTERS ===');
  r.rows.forEach(x => console.log('  ' + x.id + '  ' + x.frequency + '  ' + x.code + '  ' + x.compliance_name));

  r = await c.query('SELECT column_name FROM information_schema.columns WHERE table_name=$$branch_applicable_compliances$$ ORDER BY ordinal_position');
  console.log('\n=== BRANCH_APPLICABLE_COMPLIANCES COLS ===');
  r.rows.forEach(x => console.log('  ' + x.column_name));

  r = await c.query('SELECT * FROM branch_applicable_compliances LIMIT 20');
  console.log('\n=== BRANCH_APPLICABLE_COMPLIANCES DATA (' + r.rows.length + ') ===');
  r.rows.forEach(x => console.log('  ' + JSON.stringify(x)));

  r = await c.query('SELECT COUNT(*) as cnt FROM compliance_tasks');
  console.log('\n=== COMPLIANCE_TASKS COUNT: ' + r.rows[0].cnt + ' ===');

  r = await c.query('SELECT id, email, role FROM users WHERE role IN ($$CRM$$,$$ADMIN$$,$$CEO$$,$$CCO$$) ORDER BY role, email');
  console.log('\n=== CRM/ADMIN USERS ===');
  r.rows.forEach(x => console.log('  ' + x.id + '  ' + x.role + '  ' + x.email));

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
