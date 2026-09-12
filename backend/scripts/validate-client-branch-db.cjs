// Disposable local PostgreSQL integration checks. Build the backend before running.
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { LegitxDashboardService } = require('../dist/src/legitx/legitx-dashboard.service');
const { LegitxScopeService } = require('../dist/src/legitx/legitx-scope.service');
const { LegitxComplianceStatusService } = require('../dist/src/legitx/legitx-compliance-status.service');
const { BranchAccessService } = require('../dist/src/auth/branch-access.service');
const { AccessScopeService } = require('../dist/src/access/access-scope.service');
const db = new Client({host:'127.0.0.1',port:55439,user:'monthly_close_test',database:'postgres'});
const schema = `client_branch_test_${Date.now()}`;
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function main(){
 await db.connect();
 try {
  await db.query(`CREATE SCHEMA "${schema}"`);await db.query(`SET search_path TO "${schema}"`);
  await db.query('CREATE TABLE client_branches (id uuid, clientid uuid, branchname text, isdeleted boolean DEFAULT false, isactive boolean DEFAULT true, status text DEFAULT \'ACTIVE\')');
  await db.query('INSERT INTO client_branches(id,clientid,branchname) VALUES ($1,$4,\'One\'),($2,$4,\'Two\'),($3,$5,\'Other company\')',[id(1),id(2),id(3),id(10),id(20)]);
  await db.query('CREATE TABLE user_branches(user_id uuid,branch_id uuid)');
  await db.query('INSERT INTO user_branches VALUES($1,$2),($1,$3)',[id(99),id(1),id(2)]);
  const source={query:async(sql,params)=>(await db.query(sql,params)).rows};
  const scopeService = new LegitxScopeService(new AccessScopeService({}, {}, {}, {}, {}),new BranchAccessService(source),source);
  const user={id:id(99),userId:id(99),clientId:id(10),roleCode:'CLIENT',userType:'BRANCH',branchIds:[id(1),id(2)]};
  const resolved = await scopeService.resolve(user,{});
  assert.deepEqual(resolved.allowedBranchIds.sort(),[id(1),id(2)]);
  await assert.rejects(scopeService.resolve(user,{branchId:id(3)}),/not in company/);
  const adapter={one:async(sql,params)=>(await db.query(sql,params)).rows[0],many:source.query};
  const dashboard = new LegitxDashboardService(adapter);
  const scope={month:9,year:2026,clientId:id(10),allowedBranchIds:resolved.allowedBranchIds};
  assert.equal((await dashboard.getBranchKpi(scope)).total,2);
  await db.query('CREATE TABLE audits(client_id uuid,branch_id uuid,status text,due_date date,period_year int,period_month int)');
  await db.query("INSERT INTO audits VALUES($1,$2,'COMPLETED',NULL,2026,9),($1,$3,'PLANNED','2020-01-01',2026,9),($1,$2,'COMPLETED',NULL,2025,9),($4,$5,'COMPLETED',NULL,2026,9)",[id(10),id(1),id(2),id(20),id(3)]);
  const audit=await dashboard.getAuditKpis(scope);
  assert.equal(audit.completed,1);assert.equal(audit.pending,1);assert.equal(audit.overdue,1);assert.equal(audit.overallAuditScore,50);
  await db.query('CREATE TABLE payroll_runs(id uuid,client_id uuid,branch_id uuid,status text,period_year int,period_month int)');
  await db.query('CREATE TABLE payroll_run_employees(run_id uuid,branch_id uuid,uan text,esic text)');
  await db.query("INSERT INTO payroll_runs VALUES($1,$2,NULL,'DRAFT',2026,9)",[id(30),id(10)]);
  await db.query("INSERT INTO payroll_run_employees VALUES($1,$2,NULL,NULL),($1,$3,'uan',NULL),($1,$4,NULL,NULL)",[id(30),id(1),id(2),id(3)]);
  const payroll=await dashboard.getPayroll(scope);assert.equal(payroll.pfPendingEmployees,1);assert.equal(payroll.esiPendingEmployees,2);
  await db.query('CREATE TABLE compliance_tasks(id int,client_id uuid,branch_id uuid,period_month int,period_year int,compliance_id int,title text,frequency text,status text,due_date date,remarks text)');
  await db.query('CREATE TABLE compliance_master(id int,compliance_name text,law_name text,law_family text)');
  await db.query("INSERT INTO compliance_tasks VALUES(1,$1,$2,9,2026,7,'Weekly evidence','WEEKLY','PENDING','2020-01-01',NULL),(2,$1,$2,9,2026,7,'Next evidence','WEEKLY','PENDING','2020-01-02',NULL),(3,$3,$4,9,2026,7,'Foreign','WEEKLY','PENDING','2020-01-03',NULL)",[id(10),id(1),id(20),id(3)]);
  const status=new LegitxComplianceStatusService(adapter);
  const tasks=await status.getTasks({...scope,status:'OVERDUE',limit:1,offset:1});
  assert.equal(tasks.length,1);assert.equal(tasks[0].taskId,2);
  const all=await status.getTasks({...scope,status:'OVERDUE',limit:10});assert.equal(all.length,2);
  console.log('PASS: live branch scope, cross-company denial, scoped payroll rows, monthly audit counts without double counting, and recurring-task pagination against PostgreSQL.');
 } finally { await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await db.end(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});