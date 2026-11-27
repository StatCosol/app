/* Isolated PostgreSQL integration checks. Never connects to a non-loopback host. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DataSource } = require('typeorm');
const { NotificationDigestService } = require('../dist/src/email/notification-digest.service');
const { ComplianceCronService } = require('../dist/src/compliance/compliance-cron.service');
const url = new URL(process.env.DIGEST_TEST_DB_URL || 'postgresql://digest_test@127.0.0.1:55438/postgres');
assert(['127.0.0.1','localhost'].includes(url.hostname), 'Only isolated loopback databases are permitted');
const schema='digest_test_'+Date.now();
const admin=new DataSource({type:'postgres',url:url.href,entities:[],synchronize:false});
let db;
async function main() {
 await admin.initialize();
 await admin.query('CREATE SCHEMA '+schema);
 db=new DataSource({type:'postgres',url:url.href,entities:[],synchronize:false,extra:{max:3,options:'-c search_path='+schema}});
 await db.initialize();
 await db.query(`
 CREATE TYPE mail_status AS ENUM ('NOT_SENT','SENT','FAILED');
 CREATE TABLE client_monthly_comm_runs(id uuid DEFAULT gen_random_uuid(),status text,sent_at timestamptz NOT NULL DEFAULT now(),failure_reason text);
 CREATE TABLE registration_alerts(id uuid DEFAULT gen_random_uuid(),emailed boolean DEFAULT false,email_lease_until timestamptz);
 CREATE TABLE invoice_email_logs(id uuid DEFAULT gen_random_uuid(),pending_payment_id uuid,sent_status mail_status,sent_at timestamptz,failure_reason text);
 CREATE TABLE pending_payment_followups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),reminder_count int DEFAULT 7,last_reminder_sent_at timestamptz,last_reminder_status text,last_failure_reason text,amount numeric DEFAULT 321.36,status text DEFAULT 'PENDING');
 CREATE TABLE admin_digest_runs(status text,summary jsonb,error_message text);
 `);
 const migration=fs.readFileSync(path.join(__dirname,'../migrations/20261128_recipient_notification_digests.sql'),'utf8');
 await db.query(migration); await db.query(migration);
 const svc=new NotificationDigestService(db);
 const before=new Date('2026-11-28T04:00:00Z'), due=new Date('2026-11-28T05:00:00Z');
 const make=(i,to='crm@example.invalid')=>({to,category:'Audit',subject:'Task '+i,title:'Overdue',bodyHtml:'<p>Evidence '+i+'</p>'});
 await Promise.all(Array.from({length:130},async(_,i)=>{
   const event=make(i); await Promise.all([svc.enqueue(event,before),svc.enqueue(event,before)]);
 }));
 assert.equal(Number((await db.query('SELECT count(*) FROM notification_email_events'))[0].count),130);
 const shared=await svc.enqueue({...make('shared'),cc:'finance@example.invalid',bcc:'CRM@example.invalid'},before);
 await db.query(`CREATE TABLE clients(id uuid PRIMARY KEY,client_name text,is_deleted boolean DEFAULT false);
 CREATE TABLE client_branches(id uuid PRIMARY KEY,branchname text);
 CREATE TABLE compliance_tasks(id serial PRIMARY KEY,client_id uuid,branch_id uuid,assigned_by_user_id uuid,assigned_to_user_id uuid,title text,due_date date,period_label text,status text,updated_at timestamptz);
 INSERT INTO clients VALUES('00000000-0000-0000-0000-000000000001','Synthetic client',false),('00000000-0000-0000-0000-000000000002','Deleted fixture',true);
 INSERT INTO compliance_tasks(client_id,assigned_by_user_id,assigned_to_user_id,title,due_date,status)
 SELECT '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003','Synthetic overdue '||n,'2020-01-01','PENDING' FROM generate_series(1,2) n;
 INSERT INTO compliance_tasks(client_id,title,due_date,status) VALUES('00000000-0000-0000-0000-000000000001','Approved fixture','2020-01-01','APPROVED'),('00000000-0000-0000-0000-000000000002','Deleted client fixture','2020-01-01','PENDING');`);
 let notices=0, claimCounts=[];
 const cron=new ComplianceCronService({}, {}, {}, {findOne:async()=>({email:'crm@example.invalid'})},
  {createTicket:async()=>{notices++;}},
  {sendAuditMail:async(to,subject,title,bodyHtml)=>svc.enqueue({to,subject,title,bodyHtml,category:'Audit'},before)},
  db,{start:async()=>1,succeed:async(_,n)=>claimCounts.push(n),fail:async(_,err)=>{throw err;}});
 await Promise.all([cron.markOverdueAndNotify(),cron.markOverdueAndNotify()]);
 assert.equal(notices,4);assert.deepEqual(claimCounts.sort(),[0,2]);
 assert.deepEqual((await db.query('SELECT status FROM compliance_tasks ORDER BY id')).map(r=>r.status),['OVERDUE','OVERDUE','APPROVED','PENDING']);
 await svc.enqueue(make('private','private@example.invalid'),before);
 const [payment]=await db.query("INSERT INTO pending_payment_followups(last_reminder_status) VALUES('QUEUED') RETURNING id");
 await db.query("INSERT INTO invoice_email_logs(pending_payment_id,sent_status,digest_event_id) VALUES($1,'QUEUED',$2)",[payment.id,shared.digestEventId]);
 await db.query("INSERT INTO client_monthly_comm_runs(status,sent_at,digest_event_id) VALUES('QUEUED',NULL,$1)",[shared.digestEventId]);
 await db.query("INSERT INTO registration_alerts(digest_event_id) VALUES($1)",[shared.digestEventId]);
 await db.query("INSERT INTO admin_digest_runs(status,summary) VALUES('QUEUED',$1)",[JSON.stringify({digestEventId:shared.digestEventId})]);
 let messages=[];
 const send=async(to,subject,body)=>{messages.push({to,subject,body});return {ok:true,messageId:'mock-'+messages.length};};
 await svc.flush(send,before);assert.equal(messages.length,0);
 await svc.reconcile();
 assert.equal((await db.query('SELECT status FROM client_monthly_comm_runs'))[0].status,'QUEUED');
 await Promise.all([svc.flush(send,due),svc.flush(send,due)]);
 assert.equal(messages.length,3);
 const crm=messages.find(m=>m.to==='crm@example.invalid');
 assert.equal((crm.body.match(/<section/g)||[]).length,133);
 assert(crm.body.includes('Synthetic client'));
 assert(crm.body.includes('Evidence 129'));
 assert(!crm.body.includes('Evidence private'));
 assert(!crm.body.includes('finance@example.invalid'));
 assert(!messages.find(m=>m.to==='private@example.invalid').body.includes('Evidence 129'));
 await svc.flush(send,due);assert.equal(messages.length,3);
 await svc.reconcile();await svc.reconcile();
 assert.equal((await db.query('SELECT status FROM client_monthly_comm_runs'))[0].status,'SENT');
 assert.equal((await db.query('SELECT emailed FROM registration_alerts'))[0].emailed,true);
 assert.equal((await db.query('SELECT status FROM admin_digest_runs'))[0].status,'SUCCESS');
 let pay=(await db.query('SELECT * FROM pending_payment_followups'))[0];
 assert.equal(pay.reminder_count,8);assert.equal(pay.amount,'321.36');assert.equal(pay.status,'PENDING');
 await svc.enqueue(make('late'),due);
 await svc.flush(send,new Date('2026-11-28T15:00:00Z'));assert.equal(messages.length,3);
 await svc.flush(send,new Date('2026-11-29T05:00:00Z'));assert.equal(messages.length,4);
 assert(messages[3].body.includes('Evidence late'));
 const bad=await svc.enqueue(make('uncertain','uncertain@example.invalid'),new Date('2026-11-29T04:00:00Z'));
 let attempts=0;
 const uncertain=async()=>{attempts++;throw new Error('Connection lost after DATA');};
 await svc.flush(uncertain,new Date('2026-11-29T05:00:00Z'));
 await svc.flush(uncertain,new Date('2026-11-30T05:00:00Z'));
 assert.equal(attempts,1);
 assert.equal((await db.query("SELECT status FROM notification_email_digests WHERE recipient='uncertain@example.invalid'"))[0].status,'UNKNOWN');
 const crash=await svc.enqueue(make('crash','crash@example.invalid'),new Date('2026-11-30T04:00:00Z'));
 const [reserved]=await db.query("INSERT INTO notification_email_digests(recipient,delivery_date,status,claimed_at) VALUES('crash@example.invalid','2026-11-30','SENDING',now()-interval '31 minutes') RETURNING id");
 await db.query('UPDATE notification_email_recipients SET digest_id=$1 WHERE event_id=$2',[reserved.id,crash.digestEventId]);
 await svc.reconcile();
 assert.equal((await db.query('SELECT status FROM notification_email_digests WHERE id=$1',[reserved.id]))[0].status,'UNKNOWN');
 await svc.flush(uncertain,new Date('2026-12-01T05:00:00Z'));assert.equal(attempts,1);
 console.log('PASS: migration twice; 130 tasks and duplicate enqueues; concurrent senders; private recipients; all-item rendering; IST cutoff; restart/catch-up; queued/sent logs; counters once; unchanged payment amount/status; SMTP uncertainty and crash do not resend.');
}
main().finally(async()=>{if(db?.isInitialized)await db.destroy();if(admin.isInitialized){await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.destroy();}}).catch(e=>{console.error(e);process.exitCode=1;});
