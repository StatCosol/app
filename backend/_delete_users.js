require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });
  await c.connect();

  const emails = [
    'payroll_audit@statcosol.com',
    'crm_india@statcosol.com',
    'ashok@logiqems.com',
    'nikhil.r.chitnis@gmail.com',
    'ravi@pinnacle.com',
    'suresh@pinnacle.com',
    'contractor@gmail.com',
    'pcontractor@gmail.com',
    'compliance@statcosol.com',
    'anita@pinnacle.com',
    'majjiprudhvi@gmail.com',
    'kallepalli.madan@gmail.com',
    'statcosolutions@gmail.com',
  ];

  // Get user IDs
  const u1 = await c.query('SELECT id, email FROM users WHERE email = ANY($1)', [emails]);
  const u2 = await c.query("SELECT id, email FROM users WHERE email LIKE 'smoke_emp_%@test.com'");
  const all = [...u1.rows, ...u2.rows];
  console.log('Users to delete:', all.length);
  all.forEach((u) => console.log('  ', u.email, u.id));
  const ids = all.map((u) => u.id);

  if (ids.length === 0) {
    console.log('No users found. Exiting.');
    await c.end();
    return;
  }

  // Find all FK columns referencing users
  const fks = await c.query(`
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'users'
    ORDER BY tc.table_name
  `);

  // Delete compliance_evidence for tasks owned by these users first
  console.log('\n--- Deleting compliance_evidence for user tasks ---');
  const evDel = await c.query(
    `DELETE FROM compliance_evidence WHERE task_id IN (
       SELECT id FROM compliance_tasks WHERE assigned_to_user_id = ANY($1) OR assigned_by_user_id = ANY($1)
     )`, [ids]
  );
  console.log(`  compliance_evidence: deleted ${evDel.rowCount} rows`);

  // Delete compliance_tasks for these users
  const ctDel = await c.query(
    `DELETE FROM compliance_tasks WHERE assigned_to_user_id = ANY($1) OR assigned_by_user_id = ANY($1)`, [ids]
  );
  console.log(`  compliance_tasks: deleted ${ctDel.rowCount} rows`);

  console.log('\n--- Deleting related rows ---');
  for (const { table_name, column_name } of fks.rows) {
    if (table_name === 'compliance_tasks') continue; // already handled
    try {
      const r = await c.query(
        `DELETE FROM "${table_name}" WHERE "${column_name}" = ANY($1)`,
        [ids],
      );
      if (r.rowCount > 0) {
        console.log(`  ${table_name}.${column_name}: deleted ${r.rowCount} rows`);
      }
    } catch (e) {
      console.log(`  ${table_name}.${column_name}: ERROR ${e.message.split('\n')[0]}`);
    }
  }

  // Also clean audit_logs.performed_by (may not be FK-constrained)
  try {
    const r = await c.query('DELETE FROM audit_logs WHERE performed_by = ANY($1)', [ids]);
    if (r.rowCount > 0) console.log(`  audit_logs.performed_by: deleted ${r.rowCount} rows`);
  } catch (e) { /* ignore */ }

  // Now delete the users
  console.log('\n--- Deleting users ---');
  const del = await c.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
  console.log(`Deleted ${del.rowCount} users`);

  await c.end();
  console.log('\nDone!');
})();
