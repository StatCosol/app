/* Disposable loopback PostgreSQL only. No client records or delivery integrations. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DataSource } = require('typeorm');
const { transitionGovernedReport } = require('../dist/src/audits/report-governance');
const { readIssuedReport } = require('../dist/src/audits/issued-report');
const url = new URL(process.env.AUDIT_TEST_DB_URL || 'postgresql://digest_test@127.0.0.1:55438/postgres');
assert(['localhost','127.0.0.1'].includes(url.hostname), 'Loopback test database required');
const schema = 'audit_integrity_' + Date.now();
const admin = new DataSource({type:'postgres',url:url.href,entities:[]});
let db;
async function main() {
  await admin.initialize(); await admin.query('CREATE SCHEMA '+schema);
  db = new DataSource({type:'postgres',url:url.href,entities:[],extra:{max:4,options:'-c search_path='+schema}});
  await db.initialize();
  await db.query(`
    CREATE TABLE clients(id uuid PRIMARY KEY,client_name text);
    CREATE TABLE client_branches(id uuid PRIMARY KEY,branchname text);
    CREATE TABLE users(id uuid PRIMARY KEY,name text);
    CREATE TABLE audits(id uuid PRIMARY KEY,client_id uuid,branch_id uuid,contractor_user_id uuid,audit_code text,audit_type text,period_code text,status text,score numeric,score_calculated_at timestamptz,submitted_at timestamptz);
    CREATE TABLE audit_reports(id uuid PRIMARY KEY,audit_id uuid,status text,held_at timestamptz,report_type text,version_no int,executive_summary text,scope text,methodology text,findings text,recommendations text,selected_observation_ids jsonb,finalized_at timestamptz,approved_by_user_id uuid,approved_date date,published_date date,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE audit_observation_categories(id uuid PRIMARY KEY,name text);
    CREATE TABLE audit_observations(id uuid PRIMARY KEY,audit_id uuid,category_id uuid,sequence_number int,observation text,clause text,risk text,status text,recommendation text,consequences text,compliance_requirements text,elaboration text,evidence_file_paths text,created_at timestamptz DEFAULT now());
    CREATE TABLE audit_checklist_items(id uuid PRIMARY KEY,audit_id uuid,item_label text,status text,remarks text,sort_order int,created_at timestamptz DEFAULT now());
    CREATE TABLE audit_item_evidence(id uuid,item_id uuid,file_name text,uploaded_role text,revision int,description text,location text,created_at timestamptz);
    CREATE TABLE audit_entry_answers(audit_id uuid,item_id text,answer text,status text,remarks text);
    CREATE TABLE audit_entry_evidence(audit_id uuid,item_id text,filename text);
    CREATE TABLE audit_entry_documents(audit_id uuid,item_id text,filename text,revision int,review_status text);
  `);
  const migration = fs.readFileSync(path.join(__dirname,'../migrations/20261128_audit_report_publications.sql'),'utf8');
  await db.query(migration); await db.query(migration);
  const client = randomUUID(), audit = randomUUID(), report = randomUUID(), observation = randomUUID();
  await db.query('INSERT INTO clients VALUES ($1,$2)',[client,'TEST ONLY — isolated client']);
  await db.query("INSERT INTO audits(id,client_id,audit_code,audit_type,period_code,status,score) VALUES($1,$2,'TEST-ISSUED-PDF','CONTRACTOR','2026-11','IN_PROGRESS',NULL)",[audit,client]);
  await db.query("INSERT INTO audit_observations(id,audit_id,sequence_number,observation,risk,status,evidence_file_paths) VALUES($1,$2,1,'Original finding for issued report','CRITICAL','RESOLVED','[\"test-only.pdf\"]')",[observation,audit]);
  await db.query("INSERT INTO audit_reports(id,audit_id,status,report_type,version_no,executive_summary,scope,methodology,findings,recommendations) VALUES($1,$2,'DRAFT','CLIENT',1,'Synthetic assessment summary','Scope of the isolated fixture','Document and site review','A detailed synthetic finding','Corrective action recommendations')",[report,audit]);
  // Submission locks its assessment, even if a stale worker attempts a new score.
  await db.query("UPDATE audits SET status='SUBMITTED',score=62,score_calculated_at=now(),submitted_at=now() WHERE id=$1",[audit]);
  await db.query("UPDATE audit_reports SET status='SUBMITTED' WHERE id=$1",[report]);
  await db.query("UPDATE audits SET score=100 WHERE id=$1",[audit]);
  assert.equal(Number((await db.query('SELECT score FROM audits WHERE id=$1',[audit]))[0].score),62);
  for (const sql of ["UPDATE audit_observations SET observation='forbidden' WHERE id=$1",'DELETE FROM audit_observations WHERE id=$1'])
    await assert.rejects(db.query(sql,[observation]),/read-only/);
  await assert.rejects(db.query("INSERT INTO audit_observations(id,audit_id,status) VALUES($1,$2,'OPEN')",[randomUUID(),audit]),/read-only/);
  await transitionGovernedReport(db,{id:report,status:'SUBMITTED'},'approve');
  await transitionGovernedReport(db,{id:report,status:'APPROVED'},'publishCrm');
  const original = await readIssuedReport(db,report);
  assert.equal(original.subarray(0,5).toString(),'%PDF-');
  assert(original.length > 1000);
  assert.equal(Number((await db.query('SELECT assessment_score FROM audit_report_publications WHERE report_id=$1',[report]))[0].assessment_score),62);
  await assert.rejects(db.query('UPDATE audit_report_publications SET pdf=$2 WHERE report_id=$1',[report,Buffer.from('modified')]),/immutable/);
  await assert.rejects(db.query('DELETE FROM audit_report_publications WHERE report_id=$1',[report]),/immutable/);
  await db.query("UPDATE audits SET status='CLOSED',score=100 WHERE id=$1",[audit]);
  assert.equal(Number((await db.query('SELECT score FROM audits WHERE id=$1',[audit]))[0].score),62);
  // A new draft may change findings; the already issued PDF remains byte-identical.
  const revision = randomUUID();
  await db.query("INSERT INTO audit_reports(id,audit_id,status,report_type,version_no,updated_at) VALUES($1,$2,'DRAFT','CLIENT',2,clock_timestamp())",[revision,audit]);
  await db.query("UPDATE audits SET status='IN_PROGRESS',score=NULL,submitted_at=NULL WHERE id=$1",[audit]);
  await db.query("UPDATE audit_observations SET observation='New revision finding',status='OPEN' WHERE id=$1",[observation]);
  assert.deepEqual(await readIssuedReport(db,report),original);
  // Finalization holds the same audit lock; a concurrent writer wakes and rejects.
  const lock = db.createQueryRunner(); await lock.connect(); await lock.startTransaction();
  await lock.query('SELECT id FROM audits WHERE id=$1 FOR UPDATE',[audit]);
  const competing = db.query("UPDATE audit_observations SET observation='late edit' WHERE id=$1",[observation]);
  const rejection = assert.rejects(competing,/read-only/);
  await lock.query("UPDATE audit_reports SET status='SUBMITTED' WHERE id=$1",[revision]);
  await lock.commitTransaction(); await lock.release(); await rejection;
  // A failure while archiving must roll back publication itself.
  await db.query("UPDATE audit_reports SET status='APPROVED' WHERE id=$1",[revision]);
  await db.query(`ALTER TABLE audit_report_publications ADD CONSTRAINT simulated_storage_failure CHECK (report_id <> '${revision}'::uuid)`);
  await assert.rejects(transitionGovernedReport(db,{id:revision,status:'APPROVED'},'publishAdmin'),/simulated_storage_failure/);
  assert.equal((await db.query('SELECT status FROM audit_reports WHERE id=$1',[revision]))[0].status,'APPROVED');
  assert.equal((await db.query('SELECT * FROM audit_report_publications WHERE report_id=$1',[revision])).length,0);
  await db.query('ALTER TABLE audit_report_publications DROP CONSTRAINT simulated_storage_failure');
  await transitionGovernedReport(db,{id:revision,status:'APPROVED'},'publishAdmin');
  assert.notDeepEqual(await readIssuedReport(db,revision),original);
  assert.deepEqual(await readIssuedReport(db,report),original);
  await assert.rejects(readIssuedReport(db,randomUUID()),/archived PDF is unavailable/);
  console.log('PASS: idempotent migration, stored PDF, immutable versions, 62% score retention, draft locks, concurrent finalization, CRM/Admin publication and failure rollback. No live data or emails.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
  if(db?.isInitialized) await db.destroy();
  if(admin.isInitialized){await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.destroy();}
});
