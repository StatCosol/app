// Loopback-only disposable PostgreSQL fixtures; never reads application DB settings.
require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PassThrough } = require('node:stream');
const ExcelJS = require('exceljs');
const { PGlite } = require('./auditxpert-test-db.cjs');
const dist = fs.existsSync(path.join(__dirname, '../dist/src')) ? '../dist/src' : '../dist';
const { AiRiskEngineService } = require(`${dist}/ai/ai-risk-engine.service`);
const { ApplicabilityScopeGuard } = require(`${dist}/applicability/applicability-scope.guard`);
const { OperationalScopeService } = require(`${dist}/access/operational-scope.service`);
const { ReportExportService } = require(`${dist}/reports/report-export.service`);
const { ComplianceReportController } = require(`${dist}/reports/compliance-report.controller`);
const { AuditReportController } = require(`${dist}/reports/audit-report.controller`);
const { AssignmentReportController } = require(`${dist}/reports/assignment-report.controller`);

async function main() {
  const db = new PGlite();
  const ds = { query: async (sql, params) => (await db.query(sql, params)).rows };
  try {
    await db.exec(`
      CREATE TABLE clients(id uuid PRIMARY KEY, client_name text, client_code text, is_deleted boolean DEFAULT false, is_active boolean DEFAULT true);
      CREATE TABLE client_branches(id uuid PRIMARY KEY, clientid uuid REFERENCES clients, branchname text, statecode text, isdeleted boolean DEFAULT false);
      CREATE TABLE compliance_tasks(id uuid PRIMARY KEY, client_id uuid, branch_id uuid, status text);
      CREATE TABLE users(id uuid PRIMARY KEY, email text);
      CREATE TABLE client_assignments_current(client_id uuid, assigned_to_user_id uuid, assignment_type text, start_date date);
      CREATE TABLE audits(id uuid PRIMARY KEY, branch_id uuid, assigned_auditor_id uuid, audit_type text, status text, due_date date);
      CREATE TABLE ai_risk_assessments(id uuid PRIMARY KEY, client_id uuid, risk_score numeric, risk_level text, summary text,
        inspection_probability numeric, penalty_exposure_min numeric, penalty_exposure_max numeric, created_at timestamptz);
      CREATE TABLE ai_insights(client_id uuid, severity text, is_dismissed boolean, valid_until timestamptz);
    `);
    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/025_create_vw_compliance_coverage.sql'), 'utf8'));
    const clients = [randomUUID(), randomUUID(), randomUUID()];
    const branches = clients.map(() => randomUUID());
    const userId = randomUUID();
    await db.query('INSERT INTO users VALUES ($1, $2)', [userId, 'synthetic@example.invalid']);
    for (let i = 0; i < clients.length; i++) {
      await db.query('INSERT INTO clients(id,client_name,client_code) VALUES ($1,$2,$3)', [clients[i], `Company ${i}`, `TEST${i}`]);
      await db.query('INSERT INTO client_branches(id,clientid,branchname,statecode) VALUES ($1,$2,$3,$4)', [branches[i], clients[i], `Branch ${i}`, 'TS']);
      await db.query("INSERT INTO compliance_tasks VALUES ($1,$2,$3,'APPROVED')", [randomUUID(), clients[i], branches[i]]);
      await db.query("INSERT INTO client_assignments_current VALUES ($1,$2,'CRM',CURRENT_DATE-400)", [clients[i], userId]);
      for (const status of ['OPEN', 'CLOSED', 'CANCELLED', 'COMPLETED']) {
        await db.query("INSERT INTO audits VALUES ($1,$2,$3,'STATUTORY',$4,CURRENT_DATE-2)", [randomUUID(), branches[i], userId, status]);
      }
      await db.query("INSERT INTO audits VALUES ($1,$2,$3,'STATUTORY','OPEN',CURRENT_DATE)", [randomUUID(), branches[i], userId]);
      await db.query("INSERT INTO ai_risk_assessments VALUES ($1,$2,99,'CRITICAL','old',0,0,0,NOW()-interval '1 day')", [randomUUID(), clients[i]]);
      await db.query("INSERT INTO ai_risk_assessments VALUES ($1,$2,$3,$4,'latest',0,0,0,NOW())", [randomUUID(), clients[i], [10, 70, 90][i], ['LOW', 'HIGH', 'CRITICAL'][i]]);
      await db.query("INSERT INTO ai_insights VALUES ($1,'HIGH',false,NULL)", [clients[i]]);
    }

    const user = { id: userId, userId, roleCode: 'CCO' };
    let allowed = [clients[0]];
    const access = { getCcoClientIds: async () => allowed, assertClientAllowed: async () => {}, assertBranchAllowed: async () => {} };
    const scope = new OperationalScopeService(access);
    const reports = [
      [new ComplianceReportController(ds, scope), 'summary'],
      [new AuditReportController(ds, scope), 'overdue'],
      [new AssignmentReportController(ds, scope), 'health'],
    ];
    for (const [controller, method] of reports) {
      const rows = await controller[method](user);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].client_name, 'Company 0');
    }
    const exports = new ReportExportService(ds);
    for (const method of ['exportComplianceCoverage', 'exportOverdueAudits', 'exportAssignmentHealth']) {
      const response = new PassThrough();
      response.setHeader = () => {};
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      const finished = new Promise((resolve, reject) => { response.on('end', resolve); response.on('error', reject); });
      await exports[method](response, allowed);
      await finished;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.concat(chunks));
      assert.equal(workbook.worksheets[0].rowCount, 2);
      assert.equal(workbook.worksheets[0].getCell('A2').value, 'Company 0');
    }
    allowed = [];
    for (const [controller, method] of reports) assert.deepEqual(await controller[method](user), []);

    const guard = new ApplicabilityScopeGuard(ds, access);
    const request = { user, method: 'POST', body: { tenantId: clients[0], branchId: branches[0] } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) };
    assert.equal(await guard.canActivate(context), true);
    request.body.branchId = branches[1];
    await assert.rejects(guard.canActivate(context), error => error.status === 400);
    request.body.branchId = branches[0];
    await db.query('UPDATE client_branches SET isdeleted=true WHERE id=$1', [branches[0]]);
    await assert.rejects(guard.canActivate(context), error => error.status === 400);

    const risk = new AiRiskEngineService({}, {}, ds, {}, {});
    assert.deepEqual(await risk.getHighRiskClients(20, false, [clients[0]]), [], 'Old critical assessments must not override the latest low assessment');
    assert.deepEqual(await risk.getHighRiskClients(20, true, []), []);
    assert.equal((await risk.getHighRiskClients(1, false))[0].client_id, clients[2], 'Rank by score before limiting');
    assert.equal((await risk.getHighRiskClients(20, true, [clients[0]]))[0].risk_level, 'LOW');
    const summary = await risk.getPlatformRiskSummary([clients[0]]);
    assert.equal(Number(summary.total_assessed), 1);
    assert.equal(Number(summary.low), 1);
    assert.deepEqual(summary.activeInsights, { HIGH: 1 });
    const empty = await risk.getPlatformRiskSummary([]);
    assert.equal(Number(empty.total_assessed), 0);
    assert.deepEqual(empty.activeInsights, {});
    console.log('PASS: real PostgreSQL report/view queries, scoped Excel output, empty assignments, overdue statuses, applicability tenant/branch integrity, latest AI assessments and scoped aggregates.');
  } finally {
    await db.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
