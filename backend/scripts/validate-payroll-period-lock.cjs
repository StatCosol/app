// Uses real independent PostgreSQL connections; no application data is modified.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const { withPayrollPeriodLock } = require('../src/payroll/engine/payroll-period-lock');

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
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });
