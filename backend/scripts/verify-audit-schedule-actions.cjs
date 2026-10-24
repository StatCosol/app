// Disposable PostgreSQL/PGlite only. Never reads application database settings.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const { changeAuditSchedule } = require('../dist/src/audits/audit-schedule-actions');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
(async () => {
  const db = new PGlite();
  const adapter = target => ({query: async (s,p) => (await target.query(s,p)).rows});
  const source = {transaction: fn => db.transaction(tx => fn(adapter(tx)))};
  const user = {userId:id(10),roleCode:'CRM'};
  try {
    await db.exec(`CREATE TABLE audit_schedules(id uuid PRIMARY KEY,status text,updated_at timestamptz);
      CREATE TABLE audits(id uuid PRIMARY KEY,client_id uuid,status text,notes text,schedule_id uuid,
        upload_lock_from date,upload_lock_until date,updated_at timestamptz,submitted_at timestamptz,preliminary_published_at timestamptz,score numeric);
      CREATE TABLE audit_logs(entity_type text,entity_id uuid,action text,performed_by uuid,snapshot jsonb);
      CREATE TABLE audit_reports(audit_id uuid REFERENCES audits(id) ON DELETE CASCADE,status text);`);
    const tables = ['audit_checklist_items','audit_item_evidence','audit_item_reviews','audit_observations','audit_document_reviews','audit_non_compliances','audit_resubmissions','contractor_documents','ai_audit_observations'];
    for (const table of tables) await db.exec(`CREATE TABLE ${table}(audit_id uuid REFERENCES audits(id) ON DELETE CASCADE)`);
    const migration=fs.readFileSync(path.join(__dirname,'../migrations/20261024_cancelled_audit_guard.sql'),'utf8');
    await db.exec(migration); await db.exec(migration);
    for (let n=1;n<=4;n++) {
      await db.query("INSERT INTO audit_schedules VALUES($1,'SCHEDULED',NOW())",[id(n)]);
      await db.query("INSERT INTO audits(id,client_id,status,notes,schedule_id,upload_lock_from,upload_lock_until) VALUES($1,$2,'PLANNED','Original test note',$1,'2099-11-01','2099-11-08')",[id(n),id(20)]);
    }
    const run=(n,action='CANCEL')=>changeAuditSchedule(source,user,id(n),action,'TEST ONLY duplicate schedule',async()=>true);
    await run(1);
    const cancelled=(await db.query('SELECT * FROM audits WHERE id=$1',[id(1)])).rows[0];
    assert.equal(cancelled.status,'CANCELLED'); assert.equal(cancelled.upload_lock_from,null); assert.equal(cancelled.upload_lock_until,null);
    assert.ok(cancelled.notes.startsWith('Original test note\nCancellation reason:'));
    await assert.rejects(db.query("UPDATE audits SET status='IN_PROGRESS' WHERE id=$1",[id(1)]),/cancelled/);
    await assert.rejects(db.query("UPDATE audit_schedules SET status='IN_PROGRESS' WHERE id=$1",[id(1)]),/cancelled/);
    await run(2,'DELETE');
    assert.equal((await db.query('SELECT * FROM audits WHERE id=$1',[id(2)])).rows.length,0);
    const log=(await db.query('SELECT snapshot FROM audit_logs WHERE entity_id=$1',[id(2)])).rows[0].snapshot;
    assert.equal(log.before.notes,'Original test note'); assert.equal(log.operation,'DELETE_UNUSED_SCHEDULE');
    for (const table of tables) {
      await db.query(`INSERT INTO ${table} VALUES($1)`,[id(3)]);
      await assert.rejects(run(3,'DELETE'),/preserve/);
      assert.equal((await db.query(`SELECT * FROM ${table} WHERE audit_id=$1`,[id(3)])).rows.length,1);
      await db.query(`DELETE FROM ${table} WHERE audit_id=$1`,[id(3)]);
    }
    await db.query("INSERT INTO audit_reports VALUES($1,'DRAFT')",[id(3)]);
    await assert.rejects(run(3,'DELETE'),/preserve/);
    await db.query("UPDATE audits SET status='IN_PROGRESS' WHERE id=$1",[id(3)]);
    await run(3); // draft and evidence are preserved on cancellation
    assert.equal((await db.query('SELECT * FROM audit_reports WHERE audit_id=$1',[id(3)])).rows.length,1);
    await db.query("INSERT INTO audit_reports VALUES($1,'PUBLISHED')",[id(4)]);
    await assert.rejects(run(4),/report/);
    await assert.rejects(changeAuditSchedule(source,user,id(4),'DELETE','TEST ONLY reason',async()=>false),/not assigned/);
    assert.equal((await db.query('SELECT * FROM audit_logs')).rows.length,3);
    console.log('PASS: transactional cancellation/deletion, original notes and snapshots, locks/calendar, all 9 evidence/work tables, draft/published report protection, scope denial, terminal-state trigger and idempotent migration. Disposable test data only.');
  } finally { await db.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
