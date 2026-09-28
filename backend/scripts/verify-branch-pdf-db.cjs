// Synthetic data only; the adapter uses a disposable loopback database.
require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('./auditxpert-test-db.cjs');
const dist = fs.existsSync(path.join(__dirname, '../dist/src')) ? '../dist/src' : '../dist';
const { CompliancePctService } = require(`${dist}/common/services/compliance-pct.service`);
const { PdfReportService } = require(`${dist}/reports/pdf-report.service`);
const { PdfReportController } = require(`${dist}/reports/pdf-report.controller`);
const { PDFParse } = require('pdf-parse');

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE clients(id uuid PRIMARY KEY, client_name text);
      CREATE TABLE client_branches(id uuid PRIMARY KEY, clientid uuid, branchname text, statecode text, status text);
      CREATE TABLE compliance_master(id uuid PRIMARY KEY, law_name text);
      CREATE TABLE compliance_tasks(id uuid PRIMARY KEY, client_id uuid, branch_id uuid, compliance_id uuid,
        title text, status text, frequency text, due_date timestamptz);
    `);
    const company = randomUUID(), foreignCompany = randomUUID();
    const allowed = randomUUID(), denied = randomUUID(), foreign = randomUUID();
    await db.query('INSERT INTO clients VALUES ($1,$2),($3,$4)', [company, 'Synthetic company', foreignCompany, 'Foreign company']);
    for (const [id, client, name] of [[allowed, company, 'Allowed branch'], [denied, company, 'Hidden branch'], [foreign, foreignCompany, 'Foreign branch']]) {
      await db.query("INSERT INTO client_branches VALUES ($1,$2,$3,'TS','ACTIVE')", [id, client, name]);
    }
    const tasks = [
      [company, allowed, 'Visible approved', 'APPROVED', '2026-09-05'],
      [company, allowed, 'Visible submitted', 'SUBMITTED', '2026-09-06'],
      [company, allowed, 'Visible pending', 'PENDING', '2026-09-07'],
      [company, allowed, 'Other month', 'PENDING', '2026-08-07'],
      [company, denied, 'Hidden task', 'PENDING', '2026-09-08'],
      [foreignCompany, foreign, 'Foreign task', 'PENDING', '2026-09-09'],
      [foreignCompany, allowed, 'Corrupt tenant task', 'PENDING', '2026-09-10'],
    ];
    for (const [client, branch, title, status, date] of tasks) {
      await db.query("INSERT INTO compliance_tasks VALUES ($1,$2,$3,NULL,$4,$5,'MONTHLY',$6)", [randomUUID(), client, branch, title, status, date]);
    }
    const ds = { query: async (sql, params) => (await db.query(sql, params)).rows };
    const pct = new CompliancePctService(ds);
    const rows = await pct.clientBranchesPct(company, '2026-09', [allowed, foreign]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].total, 3);
    assert.equal(rows[0].compliancePct, 66.7);
    assert.deepEqual(await pct.clientBranchesPct(company, '2026-09', []), []);
    assert.equal((await pct.clientBranchesPct(company, undefined, [allowed]))[0].total, 4);
    const scope = { resolve: async () => ({ level: 'branches', clientId: company, branchIds: [allowed, foreign] }) };
    const entitlements = { assertModule: async (id, module) => {
      assert.equal(id, company);
      assert.equal(module, 'EMPLOYEE_COMPLIANCE');
    } };
    const controller = new PdfReportController(new PdfReportService(pct), ds, scope, entitlements);
    for (const method of ['complianceSummary', 'riskHeatmap', 'dtss']) {
      let buffer;
      await controller[method]({}, company, '2026-09', { set() {}, end(value) { buffer = value; } });
      assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const { text } = await parser.getText();
        assert.match(text, /Assigned branches/);
        assert.match(text, /Allowed branch/);
        for (const hidden of ['Hidden branch', 'Hidden task', 'Foreign branch', 'Foreign task', 'Corrupt tenant task', 'Other month']) {
          assert.ok(!text.includes(hidden), `${method} leaked ${hidden}`);
        }
        if (method === 'complianceSummary') assert.match(text, /66\.7%/);
        if (method === 'dtss') assert.match(text, /Visible approved/);
      } finally { await parser.destroy(); }
    }
    console.log('PASS: branch SQL isolation, month filtering, scoped totals and all three parsed PDF exports');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
