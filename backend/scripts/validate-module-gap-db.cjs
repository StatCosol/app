// Runs only against the existing disposable loopback PostgreSQL cluster.
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { InvoicePaymentsService } = require('../dist/src/accounts-billing/services/invoice-payments.service');
const { AppraisalScopeGuard } = require('../dist/src/performance-appraisal/appraisal-scope.guard');
const config = { host: '127.0.0.1', port: 55439, user: 'monthly_close_test', database: 'postgres' };
const schema = `module_gap_test_${Date.now()}`;
async function main() {
  const admin = new Client(config); await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`SET search_path TO "${schema}"`);
    await admin.query('CREATE TABLE invoice_payments (receipt_number text UNIQUE NOT NULL)');
    const now = new Date();
    const fy = now.getMonth() >= 3 ? `${now.getFullYear()}-${String(now.getFullYear()+1).slice(2)}` : `${now.getFullYear()-1}-${String(now.getFullYear()).slice(2)}`;
    const prefix = `STS/REC/${fy}/`;
    await admin.query('INSERT INTO invoice_payments VALUES ($1), ($2)', [prefix+'9999', prefix+'10000']);
    async function receipt() {
      const db = new Client(config); await db.connect();
      try {
        await db.query('BEGIN'); await db.query(`SET LOCAL search_path TO "${schema}"`);
        const manager = { query: async (sql, params) => (await db.query(sql, params)).rows };
        const service = new InvoicePaymentsService({}, {}, {});
        const number = await service.generateReceiptNumber(manager);
        await db.query('INSERT INTO invoice_payments VALUES ($1)', [number]);
        await db.query('COMMIT'); return number;
      } catch (e) { await db.query('ROLLBACK'); throw e; }
      finally { await db.end(); }
    }
    const numbers = await Promise.all([receipt(), receipt()]);
    assert.deepEqual(numbers.sort(), [prefix+'10001', prefix+'10002']);
    await admin.query('CREATE TABLE employee_appraisals (id uuid, client_id uuid, branch_id uuid)');
    const ids = [1,2,3,4,5].map(n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
    await admin.query('INSERT INTO employee_appraisals VALUES ($1,$2,$3)', [ids[0],ids[1],ids[2]]);
    const guard = new AppraisalScopeGuard({ query: async (sql, params) => (await admin.query(sql, params)).rows });
    const request = {path:'/api/v1/appraisal/employees/'+ids[0],method:'GET',params:{id:ids[0]},query:{},body:{},user:{roleCode:'CLIENT',userType:'BRANCH',clientId:ids[1],branchIds:[ids[2]]}};
    const context = {switchToHttp:()=>({getRequest:()=>request})};
    assert.equal(await guard.canActivate(context), true);
    request.user.clientId=ids[3];
    await assert.rejects(guard.canActivate(context), /not in scope/);
    request.user.clientId=ids[1]; request.user.branchIds=[ids[4]];
    await assert.rejects(guard.canActivate(context), /not in scope/);
    console.log('PASS: real PostgreSQL receipt rollover and two concurrent transactions allocate unique sequential receipts; real database appraisal ownership permits own branch and denies another company or branch.');
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
}
main().catch(error=>{ console.error(error); process.exitCode=1; });