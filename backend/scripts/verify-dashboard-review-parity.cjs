// Disposable local database only. No application credentials or live writes.
const assert = require('node:assert/strict');
const {PGlite} = require('./auditxpert-test-db.cjs');
const {AuditAuditorDashboardService} = require('../dist/src/audits/audit-auditor-dashboard.service');
const {CrmDashboardService} = require('../dist/src/crm/crm-dashboard.service');
const {CRM_DASHBOARD_KPI_SQL} = require('../dist/src/crm/sql/crm-dashboard.sql');
const {actualUnitDocumentSql, actualAuditObservationSql} = require('../dist/src/common/actual-records');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
(async()=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE TABLE clients(id uuid,client_name text);
    CREATE TABLE client_branches(id uuid,clientid uuid,branchname text);
    CREATE TABLE users(id uuid,name text);
    CREATE TABLE audits(id uuid,audit_code text,notes text,branch_id uuid,client_id uuid,contractor_user_id uuid,assigned_auditor_id uuid,status text,audit_type text,period_code text,due_date date,scheduled_date date,created_at timestamptz DEFAULT now(),submitted_at timestamptz,score int);
    CREATE TABLE client_assignments_current(client_id uuid,assigned_to_user_id uuid,assignment_type text);
    CREATE TABLE contractor_documents(id uuid,branch_id uuid,file_name text,title text,status text,doc_type text,doc_month text,created_at timestamptz DEFAULT now());`);
  await db.query('INSERT INTO clients VALUES($1,\'Client\'),($2,\'Foreign\')',[id(1),id(2)]);
  await db.query('INSERT INTO client_branches VALUES($1,$2,\'Branch\'),($3,$4,\'Foreign\')',[id(3),id(1),id(4),id(2)]);
  for(const [n,code,notes,branch,auditor,status] of [
    [10,'REAL-2099',null,id(3),id(5),'IN_PROGRESS'],
    [11,'TEST-MARKED','TEST ONLY dashboard',id(3),id(5),'IN_PROGRESS'],
    [12,'AX-2099-48EF3CF2FE89',null,'94ad1c42-ea05-460e-b494-0a7e634de127',id(5),'IN_PROGRESS'],
    [13,'FOREIGN',null,id(3),id(6),'IN_PROGRESS'],
    [14,'REAL-REPORT',null,id(3),id(5),'SUBMITTED'],
    [15,'TEST-REPORT','SYNTHETIC TEST ONLY report',id(3),id(5),'SUBMITTED']]) {
    await db.query("INSERT INTO audits(id,audit_code,notes,branch_id,client_id,assigned_auditor_id,status,audit_type,period_code) VALUES($1,$2,$3,$4,$5,$6,$7,'CONTRACTOR','2099-12')",[id(n),code,notes,branch,id(1),auditor,status]);
  }
  const source={query:async(sql,p)=>(await db.query(sql,p)).rows};
  const svc=new AuditAuditorDashboardService({}, {}, {}, source);
  const user={userId:id(5),roleCode:'AUDITOR'};
  assert.equal((await svc.getAuditorDashboardSummary(user)).totalAssigned,2);
  assert.deepEqual((await svc.getAuditorUpcomingAudits(user)).map(x=>x.auditCode),['REAL-2099']);
  assert.deepEqual((await svc.getAuditorRecentSubmitted(user)).map(x=>x.auditCode),['REAL-REPORT']);
  assert.equal((await svc.getAuditorUpcomingAudits(user,{clientId:id(2)})).length,0);
  // Duplicate assignments must not duplicate the document queue or counter.
  await db.query("INSERT INTO client_assignments_current VALUES($1,$2,'CRM'),($1,$2,'CRM')",[id(1),id(7)]);
  const docs=[['ordinary.pdf','Normal','UPLOADED',id(3)],['Test certificate.pdf','Normal','PENDING_REVIEW',id(3)],['TEST-recon.pdf','Normal','UPLOADED',id(3)],['ordinary.pdf','SYNTHETIC TEST ONLY proof','PENDING_REVIEW',id(3)],['foreign.pdf','Normal','PENDING_REVIEW',id(4)],['approved.pdf','Normal','APPROVED',id(3)]];
  for(let n=0;n<docs.length;n++)await db.query("INSERT INTO contractor_documents(id,file_name,title,status,branch_id,doc_type,doc_month,created_at) VALUES($1,$2,$3,$4,$5,'WAGE_REGISTER','2025-12','2025-12-01')",[id(30+n),...docs[n]]);
  const adapter={many:source.query,one:async(sql,p)=>sql===CRM_DASHBOARD_KPI_SQL?{pending_review_count:0}:(await source.query(sql,p))[0]};
  const crm=new CrmDashboardService(adapter);
  const total=await crm.getKpis(id(7));
  const list=await crm.getPendingDocuments(id(7),{limit:100});
  assert.equal(total.contractor_pending_review_count,2);
  assert.equal(total.pending_review_count,0); // MCD remains a separate metric.
  assert.equal(list.length,total.contractor_pending_review_count);
  assert.equal((await crm.getPendingDocuments(id(7),{limit:1})).length,1);
  assert.equal((await crm.getPendingDocuments(id(7),{clientId:id(2)})).length,0);
  assert.equal((await crm.getKpis(id(8))).contractor_pending_review_count,0);
  await db.exec('CREATE TABLE fixture_unit_docs(id int, file_name text, remarks text); CREATE TABLE fixture_observations(id int, observation text);');
  for (const row of [
    [1,'Test certificate.pdf',null], [2,'latest.pdf','Discuss test results'],
    [3,'TEST-ONLY-20261014-original-licence.pdf',null],
    [4,'renewal.pdf','TEST ONLY synthetic renewal'],
    [5,null,null],
  ]) await db.query('INSERT INTO fixture_unit_docs VALUES($1,$2,$3)',row);
  assert.deepEqual((await db.query(`SELECT id FROM fixture_unit_docs d WHERE ${actualUnitDocumentSql('d')} ORDER BY id`)).rows.map(r=>r.id),[1,2,5]);
  for (const row of [
    [1,'Test certificate is missing'],
    [2,'TEST-BRANCH-UI-20261026 — Synthetic correction workflow check. Not an actual compliance finding.'],
    [3,'SYNTHETIC TEST ONLY correction'], [4,null],
  ]) await db.query('INSERT INTO fixture_observations VALUES($1,$2)',row);
  assert.deepEqual((await db.query(`SELECT id FROM fixture_observations o WHERE ${actualAuditObservationSql('o')} ORDER BY id`)).rows.map(r=>r.id),[1,4]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM fixture_unit_docs')).rows[0].n,5);
  console.log('PASS: unit-document and observation SQL exclude explicit fixtures, preserve ordinary test certificates/null metadata, and leave evidence rows intact.');
  console.log('PASS: all Auditor dashboard sources exclude fixtures, preserve real future audits and enforce ownership; CRM queue/count match across historical periods, pagination, duplicate assignments and test markers.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
