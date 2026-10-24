// Real PostgreSQL, two connections, disposable auditxpert_test_* database.
// Never reads application DB_HOST/DATABASE_URL or production settings.
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { PGlite } = require('./auditxpert-test-db.cjs');
const { reviewAuditAction } = require('../dist/src/audits/audit-action-approval');
const { AuditReportService } = require('../dist/src/audits/audit-report.service');
const fs = require('node:fs');
const path = require('node:path');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const outcome=p=>p.then(value=>({ok:true,value}),error=>({ok:false,error}));
(async()=>{
  const db=new PGlite(); let second;
  try {
    await db.ready;
    second=new Client({host:'127.0.0.1',port:Number(process.env.AUDITXPERT_TEST_PORT||55439),user:process.env.AUDITXPERT_TEST_USER||'monthly_close_test',password:process.env.AUDITXPERT_TEST_PASSWORD,database:db.name});
    await second.connect();
    await db.exec(`CREATE TABLE audit_schedules(id uuid PRIMARY KEY,status text,updated_at timestamptz);
      CREATE TABLE audits(id uuid PRIMARY KEY,client_id uuid,assigned_auditor_id uuid,status text,notes text,schedule_id uuid,upload_lock_from date,upload_lock_until date,updated_at timestamptz);
      CREATE TABLE audit_reports(id uuid PRIMARY KEY,audit_id uuid REFERENCES audits(id),status text,held_at timestamptz,created_at timestamptz,updated_at timestamptz);
      CREATE TABLE audit_checklist_items(audit_id uuid,status text,automated_remarks text,automation_reviewed boolean);
      CREATE TABLE audit_logs(entity_type text,entity_id uuid,action text,performed_by uuid,snapshot jsonb);`);
    await db.exec(fs.readFileSync(path.join(__dirname,'../migrations/20261024_cancelled_audit_guard.sql'),'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname,'../migrations/20261024b_audit_action_approvals.sql'),'utf8'));
    const adapter=(client,hold)=>({
      query:async(sql,params)=>(await client.query(sql,params)).rows,
      transaction:async fn=>{
        await client.query('BEGIN');
        try {
          const result=await fn({query:async(sql,params)=>{
            const result=await client.query(sql,params);
            if(hold && sql.includes('FROM audits WHERE id=$1 FOR UPDATE')){hold.locked.resolve();await hold.release.promise;}
            return result.rows;
          }});
          await client.query('COMMIT');return result;
        }catch(e){await client.query('ROLLBACK');throw e;}
      },
    });
    const cco={userId:id(12),roleCode:'CCO'},auditor={userId:id(11),roleCode:'AUDITOR'};
    function reportService(source){
      const service=new AuditReportService({}, {}, source, {});
      service.auditReportColumnsCache={scope:false,methodology:false,selectedObservationIds:false,finalizedAt:false};
      service.getReportForAuditor=async(_,auditId)=>(await source.query('SELECT status FROM audit_reports WHERE audit_id=$1',[auditId]))[0];
      return service;
    }
    async function waitForBlocked(pid){
      const until=Date.now()+10000;
      while(Date.now()<until){
        const {rows}=await db.admin.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid]);
        if(rows[0]?.wait_event_type==='Lock')return;
        await new Promise(r=>setTimeout(r,20));
      }
      throw new Error('Competing transaction did not wait on the audit lock');
    }
    for(const cancelFirst of [true,false]){
      const n=cancelFirst?1:2;
      await db.query("INSERT INTO audits(id,client_id,assigned_auditor_id,status) VALUES($1,$2,$3,'IN_PROGRESS')",[id(n),id(20),auditor.userId]);
      await db.query("INSERT INTO audit_reports(id,audit_id,status,created_at,updated_at) VALUES($1,$2,'DRAFT',NOW(),NOW())",[id(n+30),id(n)]);
      await db.query("INSERT INTO audit_action_requests(id,audit_id,client_id,action,reason,requested_by,audit_snapshot) VALUES($1,$2,$3,'CANCEL','TEST ONLY concurrent approval',$4,$5::jsonb)",[id(n+40),id(n),id(20),id(10),JSON.stringify({client_id:id(20)})]);
      const hold={locked:deferred(),release:deferred()};
      const firstSource=adapter(db.client,hold),secondSource=adapter(second);
      const cancel=source=>reviewAuditAction(source,cco,id(n+40),'APPROVE','TEST ONLY CCO concurrent approval',async()=>{});
      const finalize=source=>reportService(source).finalizeReportForAuditor(auditor,id(n));
      const first=outcome(cancelFirst?cancel(firstSource):finalize(firstSource));
      await hold.locked.promise;
      const competing=outcome(cancelFirst?finalize(secondSource):cancel(secondSource));
      try {await waitForBlocked(second.processID);} finally {hold.release.resolve();}
      const [won,lost]=await Promise.all([first,competing]);
      assert.equal(won.ok,true,won.error?.message);assert.equal(lost.ok,false);
      assert.match(lost.error.message,cancelFirst?/completed or closed/:/submitted or approved report/);
      const {rows:[row]}=await db.query('SELECT a.status AS audit,r.status AS report FROM audits a JOIN audit_reports r ON r.audit_id=a.id WHERE a.id=$1',[id(n)]);
      assert.deepEqual(row,cancelFirst?{audit:'CANCELLED',report:'DRAFT'}:{audit:'IN_PROGRESS',report:'SUBMITTED'});
    }
    // A legacy direct update is also protected by the database backstop.
    await assert.rejects(db.query("UPDATE audit_reports SET status='SUBMITTED' WHERE audit_id=$1",[id(1)]),/cancelled audit/);
    console.log('PASS: two real concurrent connections; cancellation-first blocks finalization; finalization-first blocks cancellation; no CANCELLED/SUBMITTED combination; direct-update trigger backstop.');
  }finally{await second?.end();await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
