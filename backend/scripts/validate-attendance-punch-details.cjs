// Actual daily-detail SQL against connection-local TEMP tables; synthetic data only.
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { AttendanceService } = require('../dist/src/attendance/attendance.service');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
(async () => {
 const db = new Client({host:'127.0.0.1',port:Number(process.env.AUTOMATION_TEST_PORT||55439),user:process.env.AUTOMATION_TEST_USER||'monthly_close_test',password:process.env.AUTOMATION_TEST_PASSWORD||undefined,database:process.env.AUTOMATION_TEST_DATABASE||'postgres'});
 await db.connect();
 try {
  await db.query(`CREATE TEMP TABLE ess_attendance_punches(client_id uuid,employee_id uuid,date date,punch_type text,punch_time timestamptz,latitude numeric,longitude numeric,accuracy numeric,capture_method text);
   CREATE TEMP TABLE facedesk_attendance_logs(client_id uuid,employee_id uuid,attendance_id uuid,attendance_status text,punch_type text,punch_time timestamptz);
   CREATE TEMP TABLE facedesk_attendance_review_queue(client_id uuid,attendance_id uuid,status text);`);
  const client=id(1),otherClient=id(2),employee=id(3),otherEmployee=id(4);
  await db.query(`INSERT INTO facedesk_attendance_logs VALUES
   ($1,$3,$5,'MARKED','IN','2026-10-11T09:00:00+05:30'),
   ($1,$3,$6,'MARKED','OUT','2026-10-11T10:00:00+05:30'),
   ($1,$3,$7,'APPROVED','OUT','2026-10-11T11:00:00+05:30'),
   ($1,$3,$8,'REJECTED','IN','2026-10-11T12:00:00+05:30'),
   ($2,$3,$9,'MARKED','IN','2026-10-11T13:00:00+05:30'),
   ($1,$4,$10,'MARKED','IN','2026-10-11T14:00:00+05:30'),
   ($1,$3,$11,'MARKED','IN','2026-10-10T23:59:59+05:30'),
   ($1,$3,$12,'MARKED','IN','2026-10-11T00:00:00+05:30'),
   ($1,$3,$13,'MARKED','OUT','2026-10-11T23:59:59+05:30'),
   ($1,$3,$14,'MARKED','IN','2026-10-12T00:00:00+05:30')`,[client,otherClient,employee,otherEmployee,...Array.from({length:10},(_,i)=>id(10+i))]);
  await db.query(`INSERT INTO facedesk_attendance_review_queue VALUES ($1,$3,'PENDING'),($1,$4,'APPROVED'),($2,$5,'PENDING')`,[client,otherClient,id(11),id(12),id(10)]);
  await db.query(`INSERT INTO ess_attendance_punches VALUES($1,$2,'2026-10-11','IN','2026-10-11T09:00:00+05:30',17.4,78.4,5,'FACE')`,[client,employee]);
  const service=Object.create(AttendanceService.prototype);
  service.ds={query:async(sql,parameters)=>(await db.query(sql,parameters)).rows};
  const daily=()=>service.attachDayPunches([{employeeId:employee}],client,'2026-10-11');
  let rows=await daily();
  assert.deepEqual(rows[0].punches.map(p=>p.time),['00:00:00','09:00:00','11:00:00','23:59:59']);
  assert.equal(rows[0].punches.find(p=>p.time==='09:00:00').mapUrl,'https://www.google.com/maps?q=17.4,78.4');
  assert.equal(rows[0].punches.find(p=>p.time==='11:00:00').mapUrl,null);
  await db.query("UPDATE facedesk_attendance_review_queue SET status='APPROVED' WHERE client_id=$1 AND attendance_id=$2",[client,id(11)]);
  rows=await daily();
  assert.deepEqual(rows[0].punches.map(p=>p.time),['00:00:00','09:00:00','10:00:00','11:00:00','23:59:59']);
  console.log('PASS: pending-review punches hidden despite existing daily attendance; approval makes them visible; accepted punches, mobile GPS, mirror deduplication, tenant/employee scope and IST boundaries preserved.');
 } finally {await db.end();}
})().catch(error=>{console.error(error);process.exitCode=1;});
