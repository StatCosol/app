// Isolated PostgreSQL fixtures. Temporary tables and changes are rolled back.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
require('ts-node').register({ transpileOnly: true, project: path.join(__dirname, '../tsconfig.json') });
const { AuditReportService } = require('../src/audits/audit-report.service');
const dotenv = require('dotenv');
const localEnvPath = process.env.AUDIT_TEST_ENV_FILE;
const env = localEnvPath ? dotenv.parse(fs.readFileSync(localEnvPath)) : process.env;
const host = env.DB_HOST || '127.0.0.1';
if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('Audit regression fixtures require a local database');
const db = new Client({ host, port: Number(env.DB_PORT || env.AUDITXPERT_TEST_PORT || 5432), user: env.DB_USER || env.AUDITXPERT_TEST_USER, password: env.DB_PASS || env.DB_PASSWORD || env.AUDITXPERT_TEST_PASSWORD, database: env.DB_NAME || 'postgres', connectionTimeoutMillis: 5000 });
(async () => {
  await db.connect(); await db.query('BEGIN');
  await db.query(`CREATE TEMP TABLE audits (id text, status text, assigned_auditor_id text);
    CREATE TEMP TABLE audit_reports (id text, audit_id text, status text, held_at timestamptz, executive_summary text, scope text, methodology text, findings text, recommendations text, selected_observation_ids jsonb, finalized_at timestamptz, updated_at timestamptz DEFAULT NOW(), created_at timestamptz DEFAULT NOW());
    CREATE TEMP TABLE audit_observations (id text, audit_id text);
    CREATE TEMP TABLE audit_checklist_items (audit_id text, status text, automated_remarks text, automation_reviewed boolean);
    INSERT INTO audits VALUES ('test-audit','IN_PROGRESS','test-auditor');
    INSERT INTO audit_reports (id,audit_id,status,executive_summary,scope,methodology,findings,recommendations,selected_observation_ids) VALUES ('test-report','test-audit','DRAFT','Complete executive summary for this audit','Audited site and period','Document and site review method','Findings from reviewed documents and evidence','Recommended corrective actions for this audit','[]');
    INSERT INTO audit_observations VALUES ('owned','test-audit'),('foreign','other-audit');`);
  const manager = { query: async (sql, params) => (await db.query(sql, params)).rows };
  const svc = new AuditReportService({}, {}, { transaction: fn => fn(manager) }, {});
  svc.getAuditReportColumnsAvailability = async () => ({ finalizedAt: true });
  svc.getReportForAuditor = async () => (await db.query('SELECT status FROM audit_reports')).rows[0];
  const actor = { roleCode: 'AUDITOR', userId: 'test-auditor' };
  async function remainsDraft() { assert.equal((await db.query('SELECT status FROM audit_reports')).rows[0].status, 'DRAFT'); }
  for (const field of ['executive_summary','scope','methodology','findings','recommendations']) {
    const original = (await db.query(`SELECT ${field} AS value FROM audit_reports`)).rows[0].value;
    await db.query(`UPDATE audit_reports SET ${field}=$1`, ['short']);
    await assert.rejects(() => svc.finalizeReportForAuditor(actor, 'test-audit'), /characters/); await remainsDraft();
    await db.query(`UPDATE audit_reports SET ${field}=$1`, [original]);
  }
  await assert.rejects(() => svc.finalizeReportForAuditor(actor, 'test-audit'), /Select at least one observation/); await remainsDraft();
  await db.query('UPDATE audit_reports SET selected_observation_ids=$1', [JSON.stringify(['foreign'])]);
  await assert.rejects(() => svc.finalizeReportForAuditor(actor, 'test-audit'), /outside this audit/); await remainsDraft();
  await db.query('UPDATE audit_reports SET selected_observation_ids=$1', [JSON.stringify(['owned'])]);
  await db.query("INSERT INTO audit_checklist_items VALUES ('test-audit','PENDING',NULL,FALSE)");
  await assert.rejects(() => svc.finalizeReportForAuditor(actor, 'test-audit'), /Review all audit evidence/); await remainsDraft();
  await db.query("UPDATE audit_checklist_items SET status='COMPLIED'");
  assert.equal((await svc.finalizeReportForAuditor(actor, 'test-audit')).status, 'SUBMITTED');
  await db.query('ROLLBACK');
  console.log('Audit report PostgreSQL regressions passed: required sections, empty/foreign selections, pending evidence, and valid finalization.');
})().catch(async error => { console.error(error.message); process.exitCode = 1; await db.query('ROLLBACK').catch(() => {}); }).finally(() => db.end());
