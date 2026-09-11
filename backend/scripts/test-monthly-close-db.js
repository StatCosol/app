/* Run against the dedicated disposable cluster only:
 * node -r ts-node/register scripts/test-monthly-close-db.js
 * All tables are connection-local TEMP tables; no application data is modified.
 */
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { MonthlyCloseService } = require('../src/monthly-close/monthly-close.service');

async function main() {
  const db = new Client({ host: '127.0.0.1', port: 55439, user: 'monthly_close_test', database: 'postgres' });
  await db.connect();
  try {
    await db.query(`
      CREATE TEMP TABLE attendance_records (client_id uuid, branch_id uuid, date date, approval_status text);
      CREATE TEMP TABLE attendance_mismatches (client_id uuid, branch_id uuid, date date, resolved boolean);
      CREATE TEMP TABLE payroll_runs (id uuid, client_id uuid, branch_id uuid, period_year int, period_month int, status text, created_at timestamptz DEFAULT now());
      CREATE TEMP TABLE payroll_client_settings (client_id uuid, settings jsonb);
      CREATE TEMP TABLE branch_contractor (client_id uuid, branch_id uuid, contractor_user_id uuid);
      CREATE TEMP TABLE contractor_required_documents (id uuid, client_id uuid, branch_id uuid, contractor_user_id uuid, doc_type text, is_required boolean, updated_at timestamptz DEFAULT now());
      CREATE TEMP TABLE users (id uuid, name text);
      CREATE TEMP TABLE contractor_documents (id uuid, client_id uuid, branch_id uuid, contractor_user_id uuid, doc_type text, doc_month text, status text, file_path text, expiry_date date, created_at timestamptz);
      CREATE TEMP TABLE compliance_returns (id uuid, client_id uuid, branch_id uuid, return_type text, period_year int, period_month int, status text, due_date date, crm_owner text, ack_file_path text, filed_date date, is_deleted boolean DEFAULT false);
    `);
    const c = '00000000-0000-4000-8000-000000000001';
    const b = '00000000-0000-4000-8000-000000000002';
    const v = '00000000-0000-4000-8000-000000000003';
    const other = '00000000-0000-4000-8000-000000000099';
    const dto = { clientId: c, branchId: b, month: '2026-09' };
    const source = { query: async (sql, values) => (await db.query(sql, values)).rows };
    const service = new MonthlyCloseService(source, { assertClientAllowed: async () => {}, listAllowedBranches: async () => [{ id: b, branchName: 'Test branch' }] }, { getCurrentForClient: async () => ({ enabledModules: ['EMPLOYEE_ATTENDANCE', 'PAYROLL', 'CONTRACTOR_DOCUMENTS', 'EMPLOYEE_COMPLIANCE'] }) });
    const user = { roleCode: 'CLIENT', userType: 'MASTER', clientId: c };
    let result = await service.get(user, dto);
    assert.deepEqual(result.stages.map(s => s.state), ['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN']);
    await db.query(`INSERT INTO attendance_records VALUES ($1,$2,'2026-09-01','APPROVED'), ($1,$2,'2026-09-30','PENDING'), ($1,$2,'2026-10-01','PENDING'), ($3,$2,'2026-09-01','PENDING');
    `, [c,b,other]);
    await db.query('INSERT INTO attendance_mismatches VALUES ($1,$2,\'2026-09-15\',false),($1,$2,\'2026-09-16\',true)',[c,b]);
    await db.query(`INSERT INTO payroll_runs (id,client_id,branch_id,period_year,period_month,status) VALUES (gen_random_uuid(),$1,$2,2026,9,'APPROVED'),(gen_random_uuid(),$1,NULL,2026,9,'DRAFT'),(gen_random_uuid(),$1,$3,2026,9,'DRAFT')`,[c,b,other]);
    await db.query('INSERT INTO users VALUES ($1,\'Test vendor\');', [v]);
    await db.query('INSERT INTO branch_contractor VALUES ($1,$2,$3)',[c,b,v]);
    for (const type of ['WAGE','CHALLAN','LICENCE','NOT_REQUIRED']) {
      await db.query('INSERT INTO contractor_required_documents VALUES (gen_random_uuid(),$1,NULL,$2,$3,true,now())',[c,v,type]);
    }
    await db.query('INSERT INTO contractor_required_documents VALUES (gen_random_uuid(),$1,$2,$3,\'NOT_REQUIRED\',false,now())',[c,b,v]);
    await db.query(`INSERT INTO contractor_documents VALUES
      (gen_random_uuid(),$1,$2,$3,'WAGE','2026-09','APPROVED','older.pdf',NULL,'2026-09-01'),
      (gen_random_uuid(),$1,$2,$3,'WAGE','2026-09','PENDING_REVIEW','replacement.pdf',NULL,'2026-09-02'),
      (gen_random_uuid(),$1,$2,$3,'CHALLAN','2026-08','APPROVED','previous-month.pdf',NULL,'2026-09-01'),
      (gen_random_uuid(),$1,$2,$3,'LICENCE','2026-09','APPROVED','licence.pdf','2026-09-15','2026-09-01'),
      (gen_random_uuid(),$4,$2,$3,'CHALLAN','2026-09','APPROVED','another-tenant.pdf',NULL,'2026-09-01')`,[c,b,v,other]);
    await db.query(`INSERT INTO compliance_returns (id,client_id,branch_id,return_type,period_year,period_month,status,due_date,ack_file_path,filed_date) VALUES
      (gen_random_uuid(),$1,$2,'Missing receipt',2026,9,'APPROVED','2026-10-15',NULL,'2026-10-01'),
      (gen_random_uuid(),$1,$2,'Not applicable',2026,9,'NOT_APPLICABLE',NULL,NULL,NULL),
      (gen_random_uuid(),$1,$2,'Annual due now',2026,NULL,'PENDING','2026-09-20',NULL,NULL),
      (gen_random_uuid(),$1,NULL,'Company only',2026,9,'PENDING','2026-09-20',NULL,NULL),
      (gen_random_uuid(),$1,$2,'Different month',2026,8,'PENDING','2026-09-20',NULL,NULL)`,[c,b]);
    result = await service.get(user, dto);
    const by = Object.fromEntries(result.stages.map(s => [s.area,s]));
    assert.equal(by.attendance.total,2);
    assert.equal(by.attendance.outstanding,2);
    assert.equal(by.payroll.total,1);
    assert.equal(by.payroll.state,'RECORDED_CLEAR');
    assert.equal(by.documents.total,3);
    assert.equal(by.documents.outstanding,3);
    assert.ok(by.documents.issues.find(i => i.title.includes('WAGE')).reason.includes('latest submission'));
    assert.ok(by.documents.issues.find(i => i.title.includes('CHALLAN')).reason.includes('No submission'));
    assert.ok(by.documents.issues.find(i => i.title.includes('LICENCE')).reason.includes('expires'));
    assert.equal(by.returns.total,3);
    assert.equal(by.returns.outstanding,2);
    assert.ok(by.returns.issues.find(i => i.title === 'Missing receipt').reason.includes('acknowledgment'));
    // A blank file reference never counts as evidence, even when approved.
    await db.query("UPDATE contractor_documents SET status='APPROVED',file_path='  ',expiry_date=NULL WHERE client_id=$1 AND doc_type='WAGE'",[c]);
    result = await service.get(user,dto);
    assert.ok(result.stages.find(s => s.area === 'documents').issues.find(i => i.title.includes('WAGE')).reason.includes('no recorded file'));
    // Full aggregate counts survive the 100-row action limit.
    await db.query(`INSERT INTO contractor_required_documents SELECT gen_random_uuid(),$1,NULL,$2,'EXTRA_' || n,true,now() FROM generate_series(1,110) n`,[c,v]);
    result = await service.get(user,dto);
    const docs = result.stages.find(s => s.area === 'documents');
    assert.equal(docs.total,113);
    assert.equal(docs.outstanding,113);
    assert.equal(docs.issues.length,100);
    assert.equal(docs.truncated,true);
    await db.query('INSERT INTO branch_contractor VALUES ($1,$2,$3)',[c,b,other]);
    result = await service.get(user,dto);
    const unconfigured = result.stages.find(s => s.area === 'documents');
    assert.equal(unconfigured.total,114);
    assert.equal(unconfigured.outstanding,114);
    assert.ok(unconfigured.issues.some(i => i.reason.includes('no document requirements configured')));
    // Imported/legacy nullable approval states must never imply approval.
    await db.query("TRUNCATE attendance_records, attendance_mismatches, contractor_documents, contractor_required_documents, branch_contractor, compliance_returns");
    await db.query("INSERT INTO attendance_records VALUES ($1,$2,'2026-09-01',NULL)",[c,b]);
    await db.query("INSERT INTO branch_contractor VALUES ($1,$2,$3)",[c,b,v]);
    await db.query("INSERT INTO contractor_required_documents VALUES (gen_random_uuid(),$1,$2,$3,'WAGE',true,now())",[c,b,v]);
    await db.query("INSERT INTO contractor_documents VALUES (gen_random_uuid(),$1,$2,$3,'WAGE','2026-09',NULL,'wage.pdf',NULL,now())",[c,b,v]);
    await db.query("INSERT INTO compliance_returns (id,client_id,branch_id,return_type,period_year,period_month,status,due_date,ack_file_path,filed_date) VALUES (gen_random_uuid(),$1,$2,'Missing status',2026,9,NULL,'2026-09-15','ack.pdf','2026-09-14')",[c,b]);
    result = await service.get(user,dto);
    for (const area of ['attendance','documents','returns']) {
      const stage = result.stages.find(stage => stage.area === area);
      assert.equal(stage.state,'REVIEW', `${area}: null approval state must require review`);
      assert.equal(stage.outstanding,1);
    }
    console.log('PostgreSQL integration passed: empty data, tenant/branch/month isolation, latest submission, branch overrides, expiry, missing files, filing evidence and 100-row limits.');
  } finally { await db.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });