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

  // For MONTHLY tasks, due date = 20th of (period_month + 1)
  // e.g. March (month=3) -> due April 20, April (month=4) -> due May 20
  var r = await c.query("UPDATE compliance_tasks SET due_date = make_date(CASE WHEN period_month = 12 THEN period_year + 1 ELSE period_year END, CASE WHEN period_month = 12 THEN 1 ELSE period_month + 1 END, 20) WHERE frequency = 'MONTHLY'");
  console.log('Updated due dates for ' + r.rowCount + ' monthly tasks');

  // Also set March tasks back to PENDING (they were wrongly set to APPROVED)
  var r2 = await c.query("UPDATE compliance_tasks SET status = 'PENDING' WHERE period_year = 2026 AND period_month = 3 AND frequency = 'MONTHLY' AND status = 'APPROVED' AND client_id = 'b0f71c41-5a0c-4dc5-9204-fa0bb1455f4d'");
  console.log('Reset March 2026 to PENDING: ' + r2.rowCount + ' rows');

  // Verify
  var check = await c.query('SELECT id, title, period_year, period_month, due_date, status FROM compliance_tasks ORDER BY period_year, period_month, title');
  console.log('\nAll tasks:');
  check.rows.forEach(function(t) { console.log('  ' + t.period_year + '-' + String(t.period_month).padStart(2,'0') + '  due=' + t.due_date + '  status=' + t.status + '  ' + t.title); });

  await c.end();
  console.log('\nDone.');
})().catch(function(e) { console.error(e); process.exit(1); });
