// Uses real independent PostgreSQL connections; no application data is modified.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const { withPayrollPeriodLock, withPayrollRunLock } = require('../src/payroll/engine/payroll-period-lock');

async function main() {
  if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to an isolated test database');
  const ds = {
    createQueryRunner() {
      const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
      return { connect: () => client.connect(), query: async (sql, args) => (await client.query(sql, args)).rows, release: () => client.end() };
    },
  };
  const key = `intern-payroll:${randomUUID()}:2026:4`;
  let releaseFirst;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const finish = new Promise(resolve => { releaseFirst = resolve; });
  const first = withPayrollPeriodLock(ds, key, async () => { entered(); await finish; return 'PROCESSED'; });
  try {
    await started;
    await assert.rejects(withPayrollPeriodLock(ds, key, async () => assert.fail('Overlapping run entered')), /Another intern payroll run/);
    assert.equal(await withPayrollPeriodLock(ds, key + ':different-period', async () => 'independent'), 'independent');
  } finally {
    releaseFirst();
    assert.equal(await first, 'PROCESSED');
  }
  await assert.rejects(withPayrollPeriodLock(ds, key, async () => { throw new Error('Processing failed'); }), /Processing failed/);
  assert.equal(await withPayrollPeriodLock(ds, key, async () => 'retry'), 'retry');
  console.log('Payroll period lock passed: overlapping connections rejected, independent periods allowed, success/error release and retry verified.');
  for (const firstOperation of ['calculation', 'submission']) {
    const runId = randomUUID();
    let started, finish;
    const enteredRun = new Promise(resolve => { started = resolve; });
    const finishRun = new Promise(resolve => { finish = resolve; });
    const first = withPayrollRunLock(ds, runId, async () => {
      await withPayrollRunLock(ds, runId.toUpperCase(), async () => 'nested input recalculation');
      started();
      await finishRun;
      return firstOperation;
    });
    try {
      await enteredRun;
      for (const spelling of [runId, runId.toUpperCase(), '{'+runId+'}', runId.replaceAll('-', '')]) {
        await assert.rejects(withPayrollRunLock(ds, spelling, async () => assert.fail('Concurrent run operation entered')), /Another payroll operation/);
      }
      assert.equal(await withPayrollRunLock(ds, randomUUID(), async () => 'independent run'), 'independent run');
    } finally {
      finish();
      assert.equal(await first, firstOperation);
    }
    await assert.rejects(withPayrollRunLock(ds, runId, async () => { throw new Error('Input failed'); }), /Input failed/);
    assert.equal(await withPayrollRunLock(ds, runId, async () => 'corrected retry'), 'corrected retry');
  }
  console.log('Payroll run lock passed: calculation/submission both orders, nested input recalculation, independent runs, failed-operation cleanup and retry verified with independent PostgreSQL connections.');
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });
