// Synthetic records in an isolated schema. Never reads application/production credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ClientCommPolicyService } = require('../dist/src/client-contacts/client-comm-policy.service');
const { TaskCenterService } = require('../dist/src/task-center/task-center.service');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function verify(ds) {
  await ds.query(`CREATE TABLE clients(id uuid PRIMARY KEY, client_name text);
    CREATE TABLE employees(id uuid PRIMARY KEY, client_id uuid, employee_code text);
    CREATE TABLE client_branches(id uuid PRIMARY KEY,clientid uuid,branchname text);
    CREATE TABLE audits(id uuid PRIMARY KEY,client_id uuid,branch_id uuid,assigned_auditor_id uuid);
    CREATE TABLE audit_non_compliances(id uuid PRIMARY KEY,audit_id uuid);
    CREATE TABLE system_tasks(id uuid PRIMARY KEY,module text,title text,description text,reference_id uuid,reference_type text,priority text,assigned_role text,assigned_user_id uuid,client_id uuid,branch_id uuid,contractor_id uuid,due_date date,status text,created_at timestamptz DEFAULT now());`);
  for (const n of [1,2]) { await ds.query('INSERT INTO clients VALUES($1,$2)',[id(n),`Synthetic ${n}`]); await ds.query('INSERT INTO employees VALUES($1,$2,$3)',[id(n+100),id(n),'SAME-CODE']); }
  const before = JSON.stringify(await ds.query('SELECT * FROM employees ORDER BY id'));
  const migration = fs.readFileSync(path.join(__dirname,'../migrations/20260926_client_communication_policies.sql'),'utf8');
  await ds.query(migration); await ds.query(migration);
  const policies = new ClientCommPolicyService(ds);
  const settings = { commType: 'MCD_REQUEST', requestDay: 10, deadlineDay: 20, enabled: false, version: 0 };
  const attempts = await Promise.allSettled([policies.save(id(1),settings,id(50)),policies.save(id(1),settings,id(51))]);
  assert.equal(attempts.filter(r => r.status === 'fulfilled').length,1);
  assert.equal(attempts.filter(r => r.status === 'rejected').length,1);
  assert.equal((await policies.get(id(1),'MCD_REQUEST')).enabled,false);
  assert.equal((await policies.get(id(2),'MCD_REQUEST')).enabled,true);
  assert.equal((await policies.get(id(2),'MCD_REQUEST')).requestDay,16);
  await assert.rejects(policies.save(id(1),settings,id(50)),/Settings changed/);
  for (const n of [1,2]) {
    await ds.query('INSERT INTO client_branches VALUES($1,$2,$3)',[id(n+10),id(n),`Branch ${n}`]);
    await ds.query('INSERT INTO audits VALUES($1,$2,$3,$4)',[id(n+20),id(n),id(n+10),id(n+50)]);
    await ds.query('INSERT INTO audit_non_compliances VALUES($1,$2)',[id(n+30),id(n+20)]);
    await ds.query(`INSERT INTO system_tasks(id,module,title,reference_id,reference_type,priority,assigned_role,assigned_user_id,client_id,branch_id,status) VALUES($1,'AUDIT',$2,$3,'AUDIT_NON_COMPLIANCE','HIGH','AUDITOR',$4,$5,$6,'OPEN')`,[id(n+40),`Synthetic finding ${n}`,id(n+30),id(n+50),id(n),id(n+10)]);
  }
  const tasks = new TaskCenterService(ds);
  const scope = { role: 'AUDITOR', userId: id(51), clientIds: [id(1)] };
  const result = await tasks.getWorkspace(scope, { view: 'all' });
  assert.equal(result.items.length,1); assert.equal(result.items[0].audit_id,id(21));
  assert.equal(result.items[0].reference_id,id(31));
  assert.equal((await tasks.getWorkspace(scope,{ view:'all',clientId:id(2) })).items.length,0);
  // Even a corrupted source link must not expose another client's audit context.
  await ds.query('UPDATE system_tasks SET reference_id=$1 WHERE id=$2',[id(32),id(41)]);
  assert.equal((await tasks.getWorkspace(scope,{ view:'all' })).items[0].audit_id,null);
  assert.equal(JSON.stringify(await ds.query('SELECT * FROM employees ORDER BY id')),before);
  assert.equal((await ds.query('SELECT COUNT(*)::int AS n FROM clients'))[0].n,2);
  console.log('PASS: additive migration, unchanged employee fixtures, policy isolation/version conflicts, assigned audit task links, foreign client and corrupted-reference denial.');
}
module.exports = { verify };
if (require.main === module) {
  const { Client } = require('pg');
  const client = new Client({ host:'127.0.0.1',port:Number(process.env.AUTOMATION_TEST_PORT || 55439),user:process.env.AUTOMATION_TEST_USER || 'monthly_close_test',password:process.env.AUTOMATION_TEST_PASSWORD || undefined,database:process.env.AUTOMATION_TEST_DATABASE || 'postgres' });
  const schema = `ui_automation_${Date.now()}`;
  (async () => { await client.connect(); try { await client.query(`CREATE SCHEMA ${schema}`); await client.query(`SET search_path TO ${schema}`); await verify({ query: async (sql,p) => (await client.query(sql,p)).rows }); } finally { await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await client.end(); } })().catch(e => { console.error(e); process.exitCode=1; });
}
