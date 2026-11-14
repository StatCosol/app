/* Isolated local/CI PostgreSQL fixtures. Never load application credentials. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
require('ts-node/register/transpile-only');
const { BranchRegistrationsService } = require('../src/branches/branch-registrations.service');
const { ComplianceMetricsService } = require('../src/compliances/compliance-metrics.service');
const { CalendarService } = require('../src/calendar/calendar.service');
const { RenewalFilingEngineService } = require('../src/automation/services/renewal-filing-engine.service');
const { LICENCE_REGISTRATIONS_SQL } = require('../src/branches/licence-alerts.sql');

async function main() {
  const url = process.env.REGISTRATION_TEST_URL;
  if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
    throw new Error('REGISTRATION_TEST_URL must identify an isolated local PostgreSQL instance');
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query(`CREATE TEMP TABLE clients(id uuid PRIMARY KEY,client_name text,is_deleted boolean DEFAULT false,is_active boolean DEFAULT true);
      CREATE TEMP TABLE client_branches(id uuid PRIMARY KEY,clientid uuid,branchname text,isdeleted boolean DEFAULT false,isactive boolean DEFAULT true);
      CREATE TEMP TABLE branch_registrations(id uuid PRIMARY KEY,client_id uuid,branch_id uuid,type text,registration_number text,remarks text,authority text,issued_date date,expiry_date date,licensed_worker_limit integer,document_path text,document_url text,renewal_document_url text,renewed_on timestamptz,created_at timestamptz DEFAULT now(),status text DEFAULT 'ACTIVE');
      CREATE TEMP TABLE registration_alerts(id uuid PRIMARY KEY,registration_id uuid,client_id uuid,branch_id uuid,alert_type text,priority text,title text,message text,is_read boolean DEFAULT false,created_at timestamptz DEFAULT now());`);
    const client = randomUUID(), otherClient = randomUUID(), branch = randomUUID(), secondBranch = randomUUID(), foreignBranch = randomUUID();
    await db.query("INSERT INTO clients(id,client_name) VALUES($1,'Synthetic client'),($2,'Other synthetic client')",[client,otherClient]);
    await db.query("INSERT INTO client_branches(id,clientid,branchname) VALUES($1,$2,'BRM fixture'),($3,$2,'Second fixture'),($4,$5,'Foreign fixture')",[branch,client,secondBranch,foreignBranch,otherClient]);
    // Dates are relative to the same India-local date used by the production query.
    const fixtures = [
      ['active','Factory License','FL-1',null,100],
      ['perpetual','PF Code',null,null,null],
      ['soon','Trade License','TL-1',null,20],
      ['expired','ESI Code','ESI-1',null,-1],
      ['legitimate-test-word','Test certificate','TESTING-1','Please test the certificate',10000],
      ['test-type','TEST ONLY 20261014 - Upload and renewal verification','fixture-1',null,100],
      ['test-number','Factory License','TEST-ONLY-20261014',null,-10],
      ['test-remarks','Trade License','fixture-2','SYNTHETIC TEST ONLY workflow',5],
      ['test-lowercase','test_only: expiry exercise','fixture-3',null,null],
      ['deleted','Factory License','FL-deleted',null,20],
      ['other-branch','Factory License','FL-other',null,20],
      ['other-client','Factory License','FL-foreign',null,20],
    ].map(([label,type,number,remarks,days]) => ({label,type,number,remarks,days,id:randomUUID()}));
    for (const row of fixtures) {
      const c = row.label === 'other-client' ? otherClient : client;
      const b = row.label === 'other-client' ? foreignBranch : row.label === 'other-branch' ? secondBranch : branch;
      await db.query(`INSERT INTO branch_registrations(id,client_id,branch_id,type,registration_number,remarks,expiry_date,document_url,renewal_document_url,status)
        VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $7::int IS NULL THEN NULL ELSE (NOW() AT TIME ZONE 'Asia/Kolkata')::date+$7::int END,$8,$9,$10)`,
        [row.id,c,b,row.type,row.number,row.remarks,row.days,'/uploads/synthetic-original.pdf','/uploads/synthetic-renewal.pdf',row.label==='deleted'?'DELETED':'ACTIVE']);
      await db.query("INSERT INTO registration_alerts(id,registration_id,client_id,branch_id,title) VALUES($1,$2,$3,$4,'Synthetic alert')",[randomUUID(),row.id,c,b]);
    }
    const snapshot = async () => (await db.query("SELECT json_build_object('registrations',(SELECT json_agg(r ORDER BY id) FROM branch_registrations r),'alerts',(SELECT json_agg(a ORDER BY id) FROM registration_alerts a)) AS data")).rows[0].data;
    const before = await snapshot();
    const ds = {query:async(sql,params)=>(await db.query(sql,params)).rows};
    const metrics = new ComplianceMetricsService({}, {}, {}, ds, ds, {}, {});
    assert.equal(await metrics.hasExpiringRegistration(client, branch),true);
    assert.equal(await metrics.hasExpiringRegistration(otherClient, branch),false);
    // Isolate the risk signal in a rolled-back savepoint with only test expiries.
    await db.query('SAVEPOINT metric_fixtures');
    await db.query("UPDATE branch_registrations SET expiry_date=NULL WHERE id=ANY($1::uuid[])",[fixtures.filter(r=>['soon','expired'].includes(r.label)).map(r=>r.id)]);
    assert.equal(await metrics.hasExpiringRegistration(client, branch),false,'Test and deleted expiries must not affect the risk score');
    await db.query('ROLLBACK TO SAVEPOINT metric_fixtures');
    const branches = {findOne:async({where}) => {
      const r = (await db.query('SELECT clientid AS "clientId" FROM client_branches WHERE id=$1 AND isdeleted=false',[where.id])).rows[0];
      return r || null;
    }};
    const svc = new BranchRegistrationsService({},branches,ds);
    const ids = labels => fixtures.filter(r=>labels.includes(r.label)).map(r=>r.id).sort();
    const actualLabels = ['active','perpetual','soon','expired','legitimate-test-word'];
    const testLabels = ['test-type','test-number','test-remarks','test-lowercase'];
    assert.deepEqual((await svc.listByBranch(branch,client)).map(r=>r.id).sort(),ids(actualLabels));
    const tests = await svc.listByBranch(branch,client,'TEST');
    assert.deepEqual(tests.map(r=>r.id).sort(),ids(testLabels));
    assert(tests.every(r=>r.documentUrl==='/uploads/synthetic-original.pdf' && r.renewalDocumentUrl==='/uploads/synthetic-renewal.pdf'));
    assert.deepEqual(await svc.getRegistrationSummary(client,branch),{total:5,active:3,expiringSoon:1,expired:1,scoreImpact:80});
    assert.deepEqual(await svc.getRegistrationSummary(client,[branch]),await svc.getRegistrationSummary(client,branch));
    assert.equal((await svc.getRegistrationSummary(client)).total,6);
    assert.equal((await svc.getRegistrationSummary(client,[])).total,0);
    assert.deepEqual((await svc.getAlerts(client,branch)).map(r=>r.registrationId).sort(),ids(actualLabels));
    assert.deepEqual(await svc.getAlerts(client,branch,50,[]),[]);
    assert.deepEqual(await svc.getAlerts(client,branch,50,[secondBranch]),[]);
    await assert.rejects(svc.listByBranch(foreignBranch,client),/Branch not found/);
    await assert.rejects(svc.listByBranch(foreignBranch,client,'TEST'),/Branch not found/);
    const licenceRows = (await db.query(LICENCE_REGISTRATIONS_SQL,[[branch]])).rows;
    assert.deepEqual(licenceRows.map(r=>r.registrationId).sort(),ids(actualLabels));
    const renewal = new RenewalFilingEngineService(ds,{});
    assert.deepEqual((await renewal.getExpiringRegistrations({clientId:client,branchId:branch})).map(r=>r.reg_id),ids(['soon']));
    const calendar = new CalendarService(ds,{},{});
    const cal = await calendar.getCalendar({clientId:client,branchIds:[branch],from:'2000-01-01',to:'2199-12-31',module:'REGISTRATION'});
    assert.deepEqual(cal.items.map(r=>r.entityId).sort(),ids(actualLabels.filter(x=>x!=='perpetual')));
    assert.deepEqual(await snapshot(),before,'Read scopes must preserve all registrations, documents and alert history');
    console.log('PASS: actual/test lists, Client/Branch/client-wide counts, score, alerts, calendar, licence alerts, renewal selection, assignment boundaries, preserved evidence/history.');
  } finally {
    await db.query('ROLLBACK');
    await db.end();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
