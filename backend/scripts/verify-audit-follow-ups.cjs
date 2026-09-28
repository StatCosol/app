// Build first. Uses only a disposable localhost database, never application DB settings.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Client } = require('pg');
const { DataSource } = require('typeorm');
const { AuditFollowUpsService } = require('../dist/src/audits/audit-follow-ups.service');
const config = {
  host: '127.0.0.1', port: Number(process.env.AUDITXPERT_TEST_PORT || 55439),
  user: process.env.AUDITXPERT_TEST_USER || 'monthly_close_test',
  password: process.env.AUDITXPERT_TEST_PASSWORD, database: 'postgres',
};
const database = `audit_recovery_test_${randomUUID().replaceAll('-', '')}`;
const admin = new Client(config);
const ds = new DataSource({ ...config, type: 'postgres', username: config.user, database });
const ids = { audit: randomUUID(), nc: randomUUID(), upload: randomUUID(), client: randomUUID() };
const actor = { userId: randomUUID(), roleCode: 'ADMIN' };
let mode = 'ok';
const effect = (kind, manager) => manager.query('INSERT INTO sample_effects(kind) VALUES($1)', [kind]);
const logs = { log: (input, manager) => effect(input.meta?.operation || input.action, manager) };
const worker = () => new AuditFollowUpsService(ds, {
  closeNc: async (id, manager) => {
    await manager.query("UPDATE audit_non_compliances SET status = 'CLOSED' WHERE id = $1", [id]);
    await effect('task-closed', manager);
  },
  createTaskForNc: (_, manager) => effect('task-created', manager),
}, {
  refreshAuditOutputs: async (_, manager) => {
    await effect('report-and-notification', manager);
    if (mode === 'fail') throw new Error('private document details');
    if (mode === 'disconnect') {
      const [{ pid }] = await manager.query('SELECT pg_backend_pid() AS pid');
      // Terminate only the connection in this fixture-owned disposable database.
      await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid = $1 AND datname = $2', [pid, database]);
      await manager.query('SELECT 1');
    }
  },
}, logs);
let queue = worker();
const input = (event = 'NC_ACCEPTED') => ({
  auditId: ids.audit, ncId: ids.nc, resubmissionId: ids.upload, event,
  log: { entityType: 'AUDIT_NC', entityId: ids.nc, action: event, performedBy: actor.userId, meta: { auditId: ids.audit } },
});
const enqueue = (event) => ds.transaction((manager) => queue.enqueue(manager, input(event)));
const job = async (id) => (await ds.query('SELECT * FROM audit_follow_up_jobs WHERE id = $1', [id]))[0];
const effects = async () => (await ds.query('SELECT kind FROM sample_effects ORDER BY id')).map((row) => row.kind);
const ready = (id) => ds.query("UPDATE audit_follow_up_jobs SET next_attempt_at = now() - interval '1 second' WHERE id = $1", [id]);
let passed = 0;
async function test(name, run) {
  mode = 'ok';
  await ds.query('TRUNCATE audit_follow_up_jobs, audit_resubmissions, audit_non_compliances, audits, clients, sample_effects');
  await ds.query('INSERT INTO clients VALUES($1,false)', [ids.client]);
  await ds.query("INSERT INTO audits VALUES($1,$2,'CLOSED','SAMPLE-AUDIT')", [ids.audit, ids.client]);
  await ds.query("INSERT INTO audit_non_compliances VALUES($1,$2,'ACCEPTED')", [ids.nc, ids.audit]);
  await ds.query("INSERT INTO audit_resubmissions VALUES($1,$2,'COMPLIED',now(),now())", [ids.upload, ids.nc]);
  await run();
  passed++;
  console.log('PASS: ' + name);
}
async function main() {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  await ds.initialize();
  await ds.query(`
    CREATE TABLE clients(id uuid PRIMARY KEY, is_deleted boolean);
    CREATE TABLE audits(id uuid PRIMARY KEY,client_id uuid,status text,audit_code text);
    CREATE TABLE audit_non_compliances(id uuid PRIMARY KEY,audit_id uuid,status text);
    CREATE TABLE audit_resubmissions(id uuid PRIMARY KEY,non_compliance_id uuid,final_mark text,resubmitted_at timestamptz,created_at timestamptz);
    CREATE TABLE sample_effects(id bigserial PRIMARY KEY,kind text NOT NULL);
  `);
  const migration = readFileSync(join(__dirname, '../migrations/20260928_audit_follow_up_jobs.sql'), 'utf8');
  await ds.query(migration);
  await ds.query(migration);

  await test('enqueue rolls back with the correction transaction', async () => {
    await assert.rejects(ds.transaction(async (manager) => {
      await queue.enqueue(manager, input());
      await manager.query("UPDATE audit_non_compliances SET status='CLOSED' WHERE id=$1", [ids.nc]);
      throw new Error('rollback');
    }));
    assert.equal((await ds.query('SELECT * FROM audit_follow_up_jobs')).length, 0);
    assert.equal((await ds.query('SELECT status FROM audit_non_compliances'))[0].status, 'ACCEPTED');
  });
  await test('duplicate enqueue returns the same job', async () => {
    assert.equal(await enqueue(), await enqueue());
    assert.equal((await ds.query('SELECT * FROM audit_follow_up_jobs')).length, 1);
  });
  await test('partial effects roll back; a fresh worker retries once', async () => {
    const id = await enqueue();
    mode = 'fail';
    assert.equal(await queue.run(id), 'RETRY');
    assert.deepEqual(await effects(), []);
    assert.equal((await ds.query('SELECT status FROM audit_non_compliances'))[0].status, 'ACCEPTED');
    assert.equal((await job(id)).attempts, 1);
    assert.equal((await job(id)).last_error.includes('private'), false);
    await ds.destroy();
    await ds.initialize();
    queue = worker();
    mode = 'ok';
    await ready(id);
    assert.equal(await queue.run(id), 'SUCCEEDED');
    await queue.run(id);
    assert.deepEqual(await effects(), ['task-closed', 'report-and-notification', 'NC_ACCEPTED']);
  });
  await test('connection loss rolls back effects and leaves the durable job ready', async () => {
    const id = await enqueue();
    mode = 'disconnect';
    assert.equal(await queue.run(id), 'PENDING');
    assert.deepEqual(await effects(), []);
    assert.equal((await job(id)).status, 'PENDING');
    mode = 'ok';
    queue = worker();
    await queue.drain();
    assert.equal((await job(id)).status, 'SUCCEEDED');
    assert.equal((await effects()).length, 3);
  });
  await test('simultaneous workers commit effects only once', async () => {
    const id = await enqueue();
    await Promise.all([queue.run(id), worker().run(id), worker().run(id)]);
    assert.equal((await job(id)).status, 'SUCCEEDED');
    assert.equal((await effects()).length, 3);
  });
  await test('future retry is not executed early', async () => {
    const id = await enqueue();
    mode = 'fail';
    await queue.run(id);
    mode = 'ok';
    await queue.drain();
    await queue.run(id);
    assert.equal((await job(id)).attempts, 1);
    assert.deepEqual(await effects(), []);
  });
  await test('eight failures require an audited administrator retry', async () => {
    const id = await enqueue();
    mode = 'fail';
    for (let i = 0; i < 8; i++) { await ready(id); await queue.run(id); }
    assert.equal((await job(id)).status, 'FAILED');
    mode = 'ok';
    await queue.drain();
    assert.deepEqual(await effects(), []);
    await queue.retry(actor, id);
    assert.equal((await job(id)).retry_count, 1);
    assert.equal((await job(id)).attempts, 0);
    await queue.drain();
    assert.equal((await job(id)).status, 'SUCCEEDED');
    assert.deepEqual(await effects(), ['RETRY_FOLLOW_UP', 'task-closed', 'report-and-notification', 'NC_ACCEPTED']);
    await assert.rejects(queue.retry(actor, id), /not available/);
  });
  await test('a newer correction supersedes an older acceptance', async () => {
    const id = await enqueue();
    await ds.query("INSERT INTO audit_resubmissions VALUES($1,$2,NULL,now()+interval '1 second',now())", [randomUUID(), ids.nc]);
    await ds.query("UPDATE audit_non_compliances SET status='REUPLOADED'");
    assert.equal(await queue.run(id), 'SKIPPED');
    assert.deepEqual(await effects(), ['NC_ACCEPTED']);
    assert.equal((await ds.query('SELECT status FROM audit_non_compliances'))[0].status, 'REUPLOADED');
  });
  await test('busy correction is skipped and revalidated after it commits', async () => {
    const id = await enqueue();
    const runner = ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query('SELECT id FROM audits WHERE id=$1 FOR UPDATE', [ids.audit]);
      assert.equal(await queue.run(id), 'PENDING');
      await runner.query("UPDATE audit_resubmissions SET final_mark='NON_COMPLIED'");
      await runner.query("UPDATE audit_non_compliances SET status='NC_RAISED'");
      await runner.commitTransaction();
    } finally { if (runner.isTransactionActive) await runner.rollbackTransaction(); await runner.release(); }
    assert.equal(await queue.run(id), 'SKIPPED');
    assert.deepEqual(await effects(), ['NC_ACCEPTED']);
  });
  await test('deleted company receives no operational follow-ups', async () => {
    const id = await enqueue();
    await ds.query('UPDATE clients SET is_deleted=true');
    assert.equal(await queue.run(id), 'SKIPPED');
    assert.deepEqual(await effects(), ['NC_ACCEPTED']);
  });
  await test('rejection creates a task but never refreshes a report', async () => {
    const id = await enqueue('NC_REJECTED');
    await ds.query("UPDATE audit_resubmissions SET final_mark='NON_COMPLIED'");
    await ds.query("UPDATE audit_non_compliances SET status='NC_RAISED'");
    await ds.query("UPDATE audits SET status='CORRECTION_PENDING'");
    assert.equal(await queue.run(id), 'SUCCEEDED');
    assert.deepEqual(await effects(), ['task-created', 'NC_REJECTED']);
  });
  await test('list filters, paginates, and does not expose the job payload', async () => {
    const id = await enqueue();
    let result = await queue.list(actor, 'FAILED', 1, 25);
    assert.equal(result.total, 0);
    await queue.run(id);
    result = await queue.list(actor, 'SUCCEEDED', 1, 25);
    assert.equal(result.total, 1);
    assert.equal(result.items[0].auditCode, 'SAMPLE-AUDIT');
    assert.equal('payload' in result.items[0], false);
    assert.equal((await queue.list(actor, undefined, 2, 1)).items.length, 0);
  });
  await test('foreign keys reject orphan jobs and remove jobs with deleted audits', async () => {
    await assert.rejects(ds.transaction((m) => queue.enqueue(m, { ...input(), auditId: randomUUID() })));
    await enqueue();
    await ds.query('DELETE FROM audits WHERE id=$1', [ids.audit]);
    assert.equal((await ds.query('SELECT * FROM audit_follow_up_jobs')).length, 0);
  });
  console.log(`${passed} audit recovery database checks passed.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (ds.isInitialized) await ds.destroy();
  try { await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`); } finally { await admin.end(); }
});
