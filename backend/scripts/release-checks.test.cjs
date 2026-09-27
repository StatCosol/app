const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const root = path.resolve(__dirname, '../..');
const ci = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'));

test('the payroll release check executes workflow assertions, not an echo', () => {
  const job = ci.jobs['payroll-transition-smoke'];
  assert.ok(job.steps.some(s => s.run === 'npm ci'));
  const command = job.steps.find(s => s.name === 'Payroll transition smoke check').run;
  assert.match(command, /jest.*--runTestsByPath.*payroll-approval.service.spec.ts/);
  assert.doesNotMatch(command, /echo|passWithNoTests|\|\|\s*true/);
});

test('audit database regression failures block CI', () => {
  const step = ci.jobs.backend.steps.find(s => s.run?.includes('node scripts/verify-audit-corrections.cjs'));
  assert.ok(step);
  assert.notEqual(step['continue-on-error'], true);
  assert.equal(Number(step.env.AUDITXPERT_TEST_PORT), 5432);
  assert.equal(step.env.AUDITXPERT_TEST_USER, ci.jobs.backend.services.postgres.env.POSTGRES_USER);
  assert.match(step.run, /verify-audit-entry.cjs/);
  assert.match(step.run, /verify-auditor-dashboard.cjs/);
});

test('helpdesk database regressions run against CI PostgreSQL and block failures', () => {
  const step = ci.jobs.backend.steps.find(s => s.run === 'node scripts/verify-helpdesk-db.cjs');
  assert.ok(step);
  assert.notEqual(step['continue-on-error'], true);
  assert.equal(Number(step.env.AUDITXPERT_TEST_PORT), 5432);
  assert.equal(step.env.AUDITXPERT_TEST_USER, ci.jobs.backend.services.postgres.env.POSTGRES_USER);
});

test('billing transaction regressions run against CI PostgreSQL and block failures', () => {
  const step = ci.jobs.backend.steps.find(s => s.run === 'node scripts/verify-billing-transactions.cjs');
  assert.ok(step);
  assert.notEqual(step['continue-on-error'], true);
  assert.equal(Number(step.env.AUDITXPERT_TEST_PORT), 5432);
  assert.equal(step.env.AUDITXPERT_TEST_USER, ci.jobs.backend.services.postgres.env.POSTGRES_USER);
});

test('consolidated scope database regressions are required in CI', () => {
  const step = ci.jobs.backend.steps.find(s => s.run === 'node scripts/verify-consolidated-scope-db.cjs');
  assert.ok(step);
  assert.notEqual(step['continue-on-error'], true);
  assert.equal(Number(step.env.AUDITXPERT_TEST_PORT), 5432);
  assert.equal(step.env.AUDITXPERT_TEST_USER, ci.jobs.backend.services.postgres.env.POSTGRES_USER);
});

test('AI audit reference database regressions are required in CI', () => {
  const step = ci.jobs.backend.steps.find(s => s.run === 'node scripts/verify-ai-audit-references-db.cjs');
  assert.ok(step);
  assert.notEqual(step['continue-on-error'], true);
  assert.equal(Number(step.env.AUDITXPERT_TEST_PORT), 5432);
  assert.equal(step.env.AUDITXPERT_TEST_USER, ci.jobs.backend.services.postgres.env.POSTGRES_USER);
});

test('AI payroll anomaly integrity database regressions are required in CI', () => {
  const step = ci.jobs.backend.steps.find(s => s.run === 'node scripts/verify-ai-payroll-anomalies-db.cjs');
  assert.ok(step);
  assert.notEqual(step['continue-on-error'], true);
  assert.equal(Number(step.env.AUDITXPERT_TEST_PORT), 5432);
  assert.equal(step.env.AUDITXPERT_TEST_USER, ci.jobs.backend.services.postgres.env.POSTGRES_USER);
});
