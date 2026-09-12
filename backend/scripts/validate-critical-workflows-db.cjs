// Real PostgreSQL/TypeORM boundary checks; isolated generated schema only.
// Authorization and leave/OT service responses are fixtures, not live services.
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { DataSource } = require('typeorm');
const { PayrollRunEntity } = require('../src/payroll/entities/payroll-run.entity');
const { PayrollApprovalService } = require('../src/payroll/payroll-approval.service');
const { PunchDirectionService } = require('../src/mobile-attendance/punch/punch-direction.service');
const config={host:'127.0.0.1',port:55439,user:'monthly_close_test',database:'postgres'};
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function main(){
 const schema=`critical_logic_${Date.now()}`;assert.match(schema,/^critical_logic_\d+$/);
 const admin=new Client(config);await admin.connect();let db;
 try {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  db=new DataSource({type:'postgres',host:config.host,port:config.port,username:config.user,database:config.database,schema,uuidExtension:'pgcrypto',extra:{options:`-c search_path=${schema}`},entities:[PayrollRunEntity]});await db.initialize();await db.synchronize();
  await db.query(`CREATE TABLE mobile_attendance_punches(client_id uuid,employee_id uuid,punch_time timestamptz,direction text,decision text);
    CREATE TABLE biometric_punches(client_id uuid,employee_id uuid,punch_time timestamptz,direction text,source text);
    CREATE TABLE contractor_biometric_punches(client_id uuid,contractor_employee_id uuid,punch_time timestamptz,direction text,decision text);`);
  const directions=new PunchDirectionService(db,{ingest:async()=>{}});
  const c=uuid(1), other=uuid(2), employee=uuid(3), checker=uuid(4), maker=uuid(5);
  for(const [time,start] of [['2026-09-30T18:29:59Z','2026-09-29T18:30:00.000Z'],['2026-09-30T18:30:00Z','2026-09-30T18:30:00.000Z'],['2028-02-29T12:00:00Z','2028-02-28T18:30:00.000Z']]){
    const bounds=directions.businessDayBoundsUtc(new Date(time));assert.equal(bounds.start.toISOString(),start);assert.equal(bounds.end-bounds.start,86400000);
  }
  await db.query(`INSERT INTO mobile_attendance_punches VALUES
    ($1,$3,'2026-09-29T18:29:59Z','IN','AUTO'),
    ($1,$3,'2026-09-30T18:30:00Z','IN','AUTO'),
    ($1,$3,'2026-09-30T06:00:00Z','IN','REVIEW'),
    ($1,$3,'2026-09-30T07:00:00Z','IN','REJECTED'),
    ($2,$3,'2026-09-30T08:00:00Z','IN','AUTO')`,[c,other,employee]);
  const time=new Date('2026-09-30T12:00:00Z');
  assert.equal(await directions.resolveNextPunchDirection(c,'EMPLOYEE',employee,time),'IN');
  await db.query("INSERT INTO mobile_attendance_punches VALUES ($1,$2,'2026-09-30T09:00:00Z','IN','REVIEW_APPROVED')",[c,employee]);
  await db.query("INSERT INTO biometric_punches VALUES ($1,$2,'2026-09-30T09:00:00Z','IN','MOBILE_KIOSK')",[c,employee]);
  assert.equal(await directions.resolveNextPunchDirection(c,'EMPLOYEE',employee,time),'OUT','Mirrored mobile records must not double-count');
  await db.query("INSERT INTO biometric_punches VALUES ($1,$2,'2026-09-30T16:00:00Z','OUT','DEVICE')",[c,employee]);
  await assert.rejects(directions.resolveNextPunchDirection(c,'EMPLOYEE',employee,time),/already completed/);
  assert.equal(await directions.resolveNextPunchDirection(c,'EMPLOYEE',employee,time,{endExclusive:time}),'OUT','Historical replay must exclude later punches');
  await db.query("INSERT INTO contractor_biometric_punches VALUES ($1,$2,'2026-09-30T09:00:00Z','IN','REVIEW'),($1,$2,'2026-09-30T10:00:00Z','IN','AUTO')",[c,employee]);
  assert.equal(await directions.resolveNextPunchDirection(c,'CONTRACTOR',employee,time),'OUT','Contractor direction must remain separate from employee punches');
  const repo=db.getRepository(PayrollRunEntity);
  const access={assertClientAllowed:async(_user,client)=>assert.equal(client,c)};
  const service=new PayrollApprovalService(repo,{leaveValidation:async()=>({rows:[]}),otValidation:async()=>({rows:[]})},access);
  const user={id:checker,userId:checker,roleCode:'CCO'};
  const run=await repo.save({clientId:c,branchId:null,periodYear:2026,periodMonth:9,status:'PROCESSED',title:'Original'});
  await service.submitForApproval(run.id,maker,user);
  await assert.rejects(service.approveRun(run.id,maker,'',user),/different user/);
  const decisions=await Promise.allSettled([service.approveRun(run.id,checker,'Checked',user),service.rejectRun(run.id,checker,'Correct attendance',user)]);
  assert.equal(decisions.filter(result=>result.status==='fulfilled').length,1,'Exactly one competing decision succeeds');
  await repo.update({id:run.id},{status:'REJECTED'});
  access.assertClientAllowed=async()=>{await repo.update({id:run.id},{status:'SUBMITTED'});};
  await assert.rejects(service.revertToDraft(run.id,user),/changed concurrently/);
  assert.equal((await repo.findOneByOrFail({id:run.id})).status,'SUBMITTED');
  await repo.update({id:run.id},{status:'APPROVED'});
  access.assertClientAllowed=async()=>{await repo.update({id:run.id},{title:'Concurrent edit'});};
  await service.revertToDraft(run.id,user);
  const final=await repo.findOneByOrFail({id:run.id});assert.equal(final.status,'DRAFT');assert.equal(final.title,'Concurrent edit');assert.equal(final.approvedAt,null);
  console.log('PASS: IST month/day and leap-day boundaries; tenant separation; rejected/pending exclusions; mobile mirror de-duplication; historical replay cutoff; separate contractor direction; real database approval/rejection race; self-approval denial; safe reversion and preservation of concurrent edits.');
 } finally {if(db?.isInitialized)await db.destroy();await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
