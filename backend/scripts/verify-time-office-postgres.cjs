/* Run against an isolated PostgreSQL database after npm run build. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { DataSource } = require('typeorm');
const { TimeOfficeService } = require('../dist/src/attendance/time-office');
const { TimeOfficeFollowupsService } = require('../dist/src/attendance/time-office-followups');
const url = process.env.TIME_OFFICE_TEST_DATABASE_URL;
if (!url) throw Error('TIME_OFFICE_TEST_DATABASE_URL is required; use an isolated test database.');
const schema = 'time_office_test_' + randomUUID().replaceAll('-', '');
const db = new DataSource({type:'postgres',url,extra:{options:`-c search_path=${schema},public`}});
const id = () => randomUUID();
const company=id(), otherCompany=id(), branch=id(), otherBranch=id(), sender=id(), employeeUser=id(), managerUser=id();
const missing=id(), short=id(), leave=id(), holiday=id(), otherEmployee=id(), unlinked=id();
const user={id:sender,clientId:company,roleCode:'TIME_OFFICE_EXECUTIVE'};
async function run() {
  await db.initialize();
  await db.query(`CREATE SCHEMA "${schema}"`);
  try {
    await db.query(`
      CREATE TABLE client_branches(id uuid PRIMARY KEY,clientid uuid,branchname text,statecode text,isdeleted boolean DEFAULT false);
      CREATE TABLE employees(id uuid PRIMARY KEY,client_id uuid,branch_id uuid,employee_code text,name text,
        is_active boolean DEFAULT true,approval_status text DEFAULT 'APPROVED',date_of_joining date,date_of_exit date);
      CREATE TABLE attendance_records(id uuid DEFAULT gen_random_uuid(),employee_id uuid,client_id uuid,date date,status text,
        check_in time,check_out time,worked_hours numeric,approval_status text);
      CREATE TABLE leave_applications(id uuid DEFAULT gen_random_uuid(),employee_id uuid,client_id uuid,from_date date,to_date date,
        total_days numeric,leave_type text,status text);
      CREATE TABLE holiday_calendar(client_id uuid,branch_id uuid,state_code text,holiday_date date);
      CREATE TABLE comp_off_ledger(employee_id uuid,client_id uuid,entry_date date,entry_type text,days numeric);
      CREATE TABLE roles(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,code text UNIQUE,name text,is_system boolean);
      CREATE TABLE users(id uuid PRIMARY KEY,client_id uuid,employee_id uuid,role_id uuid REFERENCES roles(id),name text,
        user_type text,is_active boolean DEFAULT true,deleted_at timestamptz);
      CREATE TABLE user_branches(user_id uuid,branch_id uuid);
      CREATE TABLE notifications(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,created_by_user_id uuid REFERENCES users(id),
        created_by_role text,query_type text,subject text,client_id uuid,branch_id uuid,status text,priority int,
        assigned_to_user_id uuid REFERENCES users(id),assigned_to_role text,source_key text);
      CREATE TABLE notification_messages(id bigserial,notification_id uuid REFERENCES notifications(id),sender_user_id uuid REFERENCES users(id),message text);
    `);
    await db.query(require('node:fs').readFileSync(require('node:path').join(__dirname,'../migrations/20261122_time_office_roles.sql'),'utf8'));
    assert.equal((await db.query("SELECT count(*)::int AS n FROM roles WHERE code LIKE 'TIME_OFFICE_%'"))[0].n,2);
    await db.query(`INSERT INTO client_branches(id,clientid,branchname,statecode) VALUES ($1,$2,'Main','TS'),($3,$4,'Other','KA')`,[branch,company,otherBranch,otherCompany]);
    for(const [employee,code,client,unit] of [[missing,'MISSING',company,branch],[short,'SHORT',company,branch],[leave,'LEAVE',company,branch],[holiday,'HOLIDAY',company,null],[otherEmployee,'OTHER',otherCompany,otherBranch],[unlinked,'UNLINKED',company,branch]]) {
      await db.query(`INSERT INTO employees(id,client_id,branch_id,employee_code,name) VALUES($1,$2,$3,$4,$4)`,[employee,client,unit,code]);
    }
    await db.query(`INSERT INTO attendance_records(employee_id,client_id,date,status,check_in,check_out,worked_hours,approval_status)
      VALUES($1,$2,'2026-01-05','PRESENT','09:00','15:00',6,'APPROVED')`,[short,company]);
    await db.query(`INSERT INTO leave_applications(employee_id,client_id,from_date,to_date,total_days,leave_type,status)
      VALUES($1,$2,'2026-01-05','2026-01-05',1,'CL','APPROVED')`,[leave,company]);
    await db.query(`INSERT INTO comp_off_ledger VALUES($1,$2,'2026-01-01','ACCRUAL',2),($1,$2,'2026-01-02','USED',-1),($1,$2,'2026-02-01','ACCRUAL',5)`,[missing,company]);
    for(const role of ['TIME_OFFICE_EXECUTIVE','EMPLOYEE','CLIENT']) await db.query('INSERT INTO roles(code) VALUES($1) ON CONFLICT(code) DO NOTHING',[role]);
    for(const [uid,emp,role,name,type] of [[sender,null,'TIME_OFFICE_EXECUTIVE','Time Office',null],[employeeUser,missing,'EMPLOYEE','Employee',null],[managerUser,null,'CLIENT','Branch Manager','BRANCH']]) {
      await db.query(`INSERT INTO users(id,client_id,employee_id,role_id,name,user_type)
        SELECT $1,$2,$3,id,$5,$6 FROM roles WHERE code=$4`,[uid,company,emp,role,name,type]);
    }
    await db.query('INSERT INTO user_branches VALUES($1,$2)',[managerUser,branch]);
    const service=new TimeOfficeService(db), followups=new TimeOfficeFollowupsService(db);
    const daily=await service.dashboard(user,{date:'2026-01-05'});
    assert.equal(daily.total,5); assert.equal(Number(daily.summary.shortHours),1); assert.equal(Number(daily.summary.onLeave),1);
    assert(!daily.rows.some(r=>r.employee_code==='OTHER'));
    assert.equal((await service.dashboard(user,{date:'2026-01-05',issue:'SHORT_HOURS'})).rows[0].id,short);
    assert.equal((await service.dashboard(user,{date:'2026-01-05',search:'MISSING',view:'coff'})).rows[0].available,1);
    assert.equal((await service.dashboard(user,{date:'2026-01-05',view:'leaves'})).total,1);
    await assert.rejects(()=>service.dashboard(user,{date:'2026-01-05',branch:otherBranch}),/Branch is not in/);
    await assert.rejects(()=>followups.send(user,{employeeId:otherEmployee,date:'2026-01-05',target:'EMPLOYEE'}),/not available/);
    await assert.rejects(()=>followups.send(user,{employeeId:leave,date:'2026-01-05',target:'EMPLOYEE'}),/no longer needs/);
    await assert.rejects(()=>followups.send(user,{employeeId:short,date:'2026-01-05',target:'EMPLOYEE'}),/no longer needs/);
    await assert.rejects(()=>followups.send(user,{employeeId:unlinked,date:'2026-01-05',target:'EMPLOYEE'}),/No active ESS/);
    const retries=await Promise.all([1,2].map(()=>followups.send(user,{employeeId:missing,date:'2026-01-05',target:'EMPLOYEE'})));
    assert.equal(retries.reduce((n,r)=>n+r.sent,0),1); assert.equal(retries.reduce((n,r)=>n+r.existing,0),1);
    assert.equal((await followups.send(user,{employeeId:missing,date:'2026-01-05',target:'BRANCH'})).sent,1);
    const deliveries=await db.query('SELECT assigned_to_user_id FROM notifications ORDER BY assigned_to_user_id');
    assert.deepEqual(deliveries.map(r=>r.assigned_to_user_id).sort(),[employeeUser,managerUser].sort());
    assert.equal((await db.query('SELECT * FROM notification_messages')).length,2);
    await db.query(`INSERT INTO attendance_records(employee_id,client_id,date,status,check_in,check_out,worked_hours) VALUES($1,$2,'2026-01-05','PRESENT','09:00','18:00',9)`,[missing,company]);
    await assert.rejects(()=>followups.send(user,{employeeId:missing,date:'2026-01-05',target:'EMPLOYEE'}),/no longer needs/);
    await db.query(`INSERT INTO holiday_calendar(client_id,holiday_date) VALUES($1,'2026-01-06')`,[company]);
    assert.equal((await service.dashboard(user,{date:'2026-01-06'})).rows.every(r=>r.status==='HOLIDAY'),true);
    await assert.rejects(()=>followups.send(user,{employeeId:unlinked,date:'2026-01-06',target:'BRANCH'}),/no longer needs/);
    await db.query(`DELETE FROM user_branches WHERE user_id=$1`,[managerUser]);
    await assert.rejects(()=>followups.send(user,{employeeId:unlinked,date:'2026-01-05',target:'BRANCH'}),/No active branch/);
    console.log('PASS: PostgreSQL attendance, leaves, comp-off, tenant isolation, recipient routing, concurrent deduplication, correction recheck, holiday exclusions and missing-recipient handling.');
  } finally {
    await db.query(`DROP SCHEMA "${schema}" CASCADE`);
    await db.destroy();
  }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
