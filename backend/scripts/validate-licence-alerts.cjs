// Real feature queries on isolated TEMP tables; no production data or email delivery.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { LicenceAlertsService } = require('../dist/src/branches/licence-alerts.service');
const { LICENCE_RECIPIENTS_SQL } = require('../dist/src/branches/licence-alerts.sql');
const { operationalDate, addCalendarDays } = require('../dist/src/common/operational-date');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

(async () => {
 const db = new Client({host:'127.0.0.1',port:Number(process.env.AUTOMATION_TEST_PORT||55439),user:process.env.AUTOMATION_TEST_USER||'monthly_close_test',password:process.env.AUTOMATION_TEST_PASSWORD||undefined,database:process.env.AUTOMATION_TEST_DATABASE||'postgres'});
 await db.connect();
 try {
  await db.query(`CREATE TEMP TABLE clients(id uuid,client_name text,is_deleted boolean,is_active boolean);
   CREATE TEMP TABLE client_branches(id uuid,clientid uuid,branchname text,isdeleted boolean,isactive boolean);
   CREATE TEMP TABLE branch_registrations(id uuid,client_id uuid,branch_id uuid,type text,registration_number text,expiry_date date,status text);
   CREATE TEMP TABLE registration_alerts(id uuid DEFAULT gen_random_uuid(),registration_id uuid,client_id uuid,branch_id uuid,alert_type text,priority text,title text,message text,module text,is_read boolean DEFAULT false,emailed boolean DEFAULT false,created_at timestamptz DEFAULT NOW());
   CREATE TEMP TABLE employees(id uuid,client_id uuid,branch_id uuid);
   CREATE TEMP TABLE contractor_employees(id uuid,client_id uuid,branch_id uuid);
   CREATE TEMP TABLE ess_attendance_punches(client_id uuid,employee_id uuid,date date,punch_time timestamptz);
   CREATE TEMP TABLE facedesk_attendance_logs(client_id uuid,employee_id uuid,branch_id uuid,attendance_id uuid,punch_time timestamptz,attendance_status text);
   CREATE TEMP TABLE facedesk_attendance_review_queue(client_id uuid,attendance_id uuid,status text);
   CREATE TEMP TABLE mobile_attendance_punches(client_id uuid,employee_id uuid,branch_id uuid,punch_time timestamptz,decision text);
   CREATE TEMP TABLE biometric_punches(client_id uuid,employee_id uuid,contractor_employee_id uuid,branch_id uuid,punch_time timestamptz,source text);
   CREATE TEMP TABLE contractor_biometric_punches(client_id uuid,contractor_employee_id uuid,branch_id uuid,punch_time timestamptz,decision text);
   CREATE TEMP TABLE roles(id uuid,code text);
   CREATE TEMP TABLE users(id uuid,client_id uuid,role_id uuid,user_type text,email text,is_active boolean,deleted_at timestamptz);
   CREATE TEMP TABLE user_branches(user_id uuid,branch_id uuid);
   CREATE TEMP TABLE client_assignments_current(client_id uuid,assignment_type text,assigned_to_user_id uuid);`);
  const migration=fs.readFileSync(path.join(__dirname,'../migrations/20261011_licence_manpower_renewal_alerts.sql'),'utf8');
  await db.query(migration);await db.query(migration);
  const client=id(1),branch=id(2),otherClient=id(3),otherBranch=id(4),reg=id(5),today=operationalDate(),expiry=addCalendarDays(today,60);
  await db.query(`INSERT INTO clients VALUES($1,'Test client',false,true),($2,'Other client',false,true)`,[client,otherClient]);
  await db.query(`INSERT INTO client_branches VALUES($3,$1,'Factory A',false,true),($4,$2,'Other factory',false,true)`,[client,otherClient,branch,otherBranch]);
  await db.query(`INSERT INTO branch_registrations VALUES($1,$2,$3,'Factory License','FL-100',$4,'ACTIVE',100)`,[reg,client,branch,expiry]);
  await assert.rejects(db.query('UPDATE branch_registrations SET licensed_worker_limit=0 WHERE id=$1',[reg]),/chk_registration_worker_limit/);
  for(let n=1;n<=72;n++) await db.query('INSERT INTO employees VALUES($1,$2,$3)',[id(100+n),client,branch]);
  for(let n=1;n<=31;n++) await db.query('INSERT INTO contractor_employees VALUES($1,$2,$3)',[id(200+n),client,branch]);
  // A large roster does not count until punched. IN/OUT and mirrored sources count once.
  for(let n=1;n<=70;n++) {
   await db.query('INSERT INTO ess_attendance_punches VALUES($1,$2,$3,$4),($1,$2,$3,$5)',[client,id(100+n),today,`${today}T09:00:00+05:30`,`${today}T18:00:00+05:30`]);
   await db.query('INSERT INTO biometric_punches VALUES($1,$2,NULL,$3,$4,\'DEVICE\')',[client,id(100+n),branch,`${today}T09:00:00+05:30`]);
  }
  for(let n=1;n<=30;n++) await db.query('INSERT INTO contractor_biometric_punches VALUES($1,$2,$3,$4,\'AUTO\'),($1,$2,$3,$5,\'AUTO\')',[client,id(200+n),branch,`${today}T09:00:00+05:30`,`${today}T18:00:00+05:30`]);
  await db.query('INSERT INTO contractor_biometric_punches VALUES($1,$2,$3,$4,\'PENDING_REVIEW\')',[client,id(231),branch,`${today}T09:00:00+05:30`]);
  await db.query('INSERT INTO facedesk_attendance_logs VALUES($1,$2,$3,$4,$5,\'MARKED\')',[client,id(171),branch,id(700),`${today}T09:00:00+05:30`]);
  await db.query('INSERT INTO facedesk_attendance_review_queue VALUES($1,$2,\'PENDING\')',[client,id(700)]);
  await db.query('INSERT INTO mobile_attendance_punches VALUES($1,$2,$3,$4,\'REVIEW_REJECTED\')',[client,id(172),branch,`${today}T09:00:00+05:30`]);
  await db.query('INSERT INTO biometric_punches VALUES($1,$2,NULL,$3,$4,\'MOBILE_KIOSK\')',[client,id(171),branch,`${today}T09:00:00+05:30`]);
  await db.query('INSERT INTO biometric_punches VALUES($1,NULL,$2,$3,$4,\'MOBILE_ESS\')',[client,id(231),branch,`${today}T09:00:00+05:30`]);
  // Date and tenant mismatches must not create a person in the selected day's deployment.
  await db.query('INSERT INTO ess_attendance_punches VALUES($1,$3,$4,$5),($2,$3,$4,$6)',[client,otherClient,id(172),today,`${addCalendarDays(today,-1)}T23:59:59+05:30`,`${today}T12:00:00+05:30`]);
  const ds={query:async(sql,params)=>(await db.query(sql,params)).rows};
  let deliveries=0, mode='skipped', to=[];
  const mail={sendAuditMail:async(recipients)=>{deliveries++;to=recipients;return mode==='skipped'?{skipped:true}:mode==='failed'?{ok:false}:{ok:true};}};
  const access={listAllowedBranches:async()=>[{id:branch}]};
  const service=new LicenceAlertsService(ds,mail,access);
  let snapshot=await service.snapshot([branch],today);
  assert.equal(snapshot.manpower[0].total,100);assert.equal(snapshot.manpower[0].status,'AT_LIMIT');
  assert.equal(snapshot.renewals[0].renewalDueDate,addCalendarDays(today,30));
  assert.equal(snapshot.renewals[0].daysToRenewal,30);
  await db.query("UPDATE contractor_biometric_punches SET decision='REVIEW_APPROVED' WHERE contractor_employee_id=$1",[id(231)]);
  snapshot=await service.snapshot([branch],today);
  assert.equal(snapshot.manpower[0].total,101);assert.equal(snapshot.manpower[0].excess,1);assert.equal(snapshot.manpower[0].contractor,31);
  await db.query("UPDATE facedesk_attendance_review_queue SET status='APPROVED'");
  assert.equal((await service.snapshot([branch],today)).manpower[0].onRoll,71);
  await db.query("UPDATE facedesk_attendance_review_queue SET status='PENDING'");
  // Accepted device punches at IST midnight count on the correct calendar day.
  await db.query('INSERT INTO biometric_punches VALUES($1,$2,NULL,$3,$4,\'DEVICE\')',[client,id(172),branch,`${today}T00:00:00+05:30`]);
  assert.equal((await service.snapshot([branch],today)).manpower[0].onRoll,71);
  await db.query('DELETE FROM biometric_punches WHERE employee_id=$1',[id(172)]);
  await db.query(`INSERT INTO roles VALUES($1,'CLIENT'),($2,'BRANCH_DESK'),($3,'CRM'),($4,'ADMIN')`,[id(800),id(801),id(802),id(803)]);
  const recipients=[
   [id(900),client,id(800),'MASTER','admin@test.invalid',true,null],
   [id(901),client,id(800),'BRANCH','branch@test.invalid',true,null],
   [id(902),client,id(801),'BRANCH','desk@test.invalid',true,null],
   [id(903),null,id(802),null,'crm@test.invalid',true,null],
   [id(904),client,id(800),'BRANCH','wrongbranch@test.invalid',true,null],
   [id(905),otherClient,id(800),'MASTER','otherclient@test.invalid',true,null],
   [id(906),client,id(800),'MASTER','inactive@test.invalid',false,null],
   [id(907),client,id(800),'MASTER','deleted@test.invalid',true,new Date()],
   [id(908),null,id(802),null,'oldcrm@test.invalid',true,null],
   [id(909),null,id(803),null,'globaladmin@test.invalid',true,null],
  ];
  for(const recipient of recipients)await db.query('INSERT INTO users VALUES($1,$2,$3,$4,$5,$6,$7)',recipient);
  await db.query('INSERT INTO user_branches VALUES($1,$4),($2,$4),($3,$5)',[id(901),id(902),id(904),branch,otherBranch]);
  await db.query('INSERT INTO client_assignments_current VALUES($1,\'CRM\',$2)',[client,id(903)]);
  const expected=['admin@test.invalid','branch@test.invalid','crm@test.invalid','desk@test.invalid'];
  assert.deepEqual((await db.query(LICENCE_RECIPIENTS_SQL,[client,branch])).rows.map(row=>row.email).sort(),expected);
  await service.checkScheduled();
  assert.equal(deliveries,2);assert.deepEqual(to.sort(),expected);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM registration_alerts WHERE emailed=true')).rows[0].n,0);
  mode='failed';await service.checkScheduled();
  assert.equal((await db.query('SELECT count(*)::int AS n FROM registration_alerts WHERE emailed=true')).rows[0].n,0);
  mode='ok';deliveries=0;
  await Promise.all([service.checkScheduled(),service.checkScheduled()]);
  assert.equal(deliveries,2,'one mail per event despite concurrent scans');
  await service.checkScheduled();assert.equal(deliveries,2,'successful events are not resent');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM registration_alerts')).rows[0].n,2);
  await db.query('UPDATE branch_registrations SET expiry_date=$2,licensed_worker_limit=120 WHERE id=$1',[reg,addCalendarDays(today,365)]);
  snapshot=await service.snapshot([branch],today);
  assert.equal(snapshot.renewals.length,0);assert.equal(snapshot.manpower[0].status,'WITHIN_LIMIT');
  await service.checkScheduled();assert.equal(deliveries,2,'renewal and capacity amendments stop obsolete warnings');
  // A snapshot read before a renewal must not enqueue an obsolete reminder.
  const stale={registrationId:reg,clientId:client,branchId:branch,type:'Factory License',expiryDate:expiry,licensedWorkerLimit:100,branchName:'Factory A',clientName:'Test client'};
  await service.notify(stale,'STALE','RENEWAL_REMINDER','HIGH','Stale','Stale');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM registration_alerts WHERE event_key='STALE'")).rows[0].n,0);
  assert.deepEqual(await service.snapshot([],today),{date:today,renewals:[],manpower:[]});
  await assert.rejects(service.listForUser({},otherBranch),/Branch not allowed/);
  console.log('PASS: 100 allowed / 101 breach; accepted distinct on-roll + contractor punches; pending/rejected, roster-only, tenant and IST exclusions; 60/30-day deadlines; scoped recipients; idempotent migration; retry and concurrent email dedup; renewal/amendment races.');
 } finally { await db.end(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
