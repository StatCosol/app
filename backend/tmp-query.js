const pg = require('pg');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
async function run() {
  await c.connect();
  // Check monthly_compliance_uploads for Hyderabad branch
  const r1 = await c.query(
    "SELECT code, month, file_path, is_deleted, created_at FROM monthly_compliance_uploads WHERE branch_id = '94ad1c42-ea05-460e-b494-0a7e634de127' AND month = '2026-04' ORDER BY code"
  );
  console.log('--- monthly_compliance_uploads for Hyderabad April 2026 ---');
  console.log(JSON.stringify(r1.rows, null, 2));

  // Check all months for this branch
  const r2 = await c.query(
    "SELECT month, COUNT(*) as cnt FROM monthly_compliance_uploads WHERE branch_id = '94ad1c42-ea05-460e-b494-0a7e634de127' AND is_deleted = false GROUP BY month ORDER BY month DESC LIMIT 6"
  );
  console.log('--- Upload counts by month ---');
  console.log(JSON.stringify(r2.rows, null, 2));

  // Check compliance_tasks for this branch
  const r3 = await c.query(
    "SELECT id, month, status, approved_by_user_id, approved_at FROM compliance_tasks WHERE branch_id = '94ad1c42-ea05-460e-b494-0a7e634de127' ORDER BY month DESC LIMIT 10"
  );
  console.log('--- compliance_tasks ---');
  console.log(JSON.stringify(r3.rows, null, 2));

  await c.end();
}
run().catch(e => { console.error(e); process.exit(1); });
