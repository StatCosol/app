/* Local/CI synthetic database only; no application environment files are loaded. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
require('ts-node/register/transpile-only');
const { actualAuditRequestSql } = require('../src/helpdesk/actual-audit-request');

async function main() {
  const url = process.env.HELPDESK_TEST_URL;
  if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
    throw new Error('HELPDESK_TEST_URL must identify an isolated local PostgreSQL instance');
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query(`CREATE TEMP TABLE audits(id uuid PRIMARY KEY, client_id uuid, branch_id uuid, notes text, audit_code text);
      CREATE TEMP TABLE audit_observations(id uuid PRIMARY KEY, audit_id uuid, observation text);
      CREATE TEMP TABLE helpdesk_tickets(id text PRIMARY KEY, client_id uuid, branch_id uuid, category text, sub_category text, description text);`);
    const client = randomUUID(), branch = randomUUID(), otherClient = randomUUID(), otherBranch = randomUUID();
    const legacyBranch = '94ad1c42-ea05-460e-b494-0a7e634de127';
    const audits = [
      [randomUUID(), client, branch, 'Actual audit; test certificate review', 'AUD-2099-001'],
      [randomUUID(), client, branch, 'TEST ONLY synthetic audit', 'AUD-2099-002'],
      [randomUUID(), client, legacyBranch, null, 'AX-2099-48EF3CF2FE89'],
      [randomUUID(), client, otherBranch, null, 'AX-2099-48EF3CF2FE89'],
    ];
    for (const row of audits) await db.query('INSERT INTO audits VALUES($1,$2,$3,$4,$5)', row);
    const observations = [
      [randomUUID(), audits[0][0], 'Test certificate is missing'],
      [randomUUID(), audits[0][0], 'TEST-BRANCH-UI-20261026 — Synthetic correction workflow check. Not an actual compliance finding.'],
      [randomUUID(), audits[1][0], 'Ordinary observation text on a synthetic audit'],
      [randomUUID(), audits[2][0], 'Legacy fixture'],
      [randomUUID(), audits[3][0], 'Actual observation on another branch'],
    ];
    for (const row of observations) await db.query('INSERT INTO audit_observations VALUES($1,$2,$3)', row);
    const description = (id, newline = '\n') => `[AUDIT_OBSERVATION_CLOSURE]${newline}Observation ID: ${id}${newline}Root Cause: Please test the alarm`;
    const cases = [
      ['real', observations[0][0], true],
      ['test-observation', observations[1][0], false],
      ['test-audit', observations[2][0], false],
      ['legacy-fixture', observations[3][0], false, { branch: legacyBranch }],
      ['same-code-other-branch', observations[4][0], true, { branch: otherBranch }],
      ['cross-client-reference', observations[1][0], true, { client: otherClient }],
      ['cross-branch-reference', observations[1][0], true, { branch: otherBranch }],
      ['null-branch-test', observations[1][0], false, { branch: null }],
      ['crlf-uppercase', observations[1][0], false, { text: description(observations[1][0].toUpperCase(), '\r\n') }],
      ['end-of-description', observations[1][0], false, { text: `Observation ID: ${observations[1][0]}` }],
      ['malformed-reference', 'not-a-uuid', true],
      ['missing-observation', randomUUID(), true],
      ['no-reference', null, true, { text: 'TEST ONLY mentioned in a real customer request' }],
      ['incidental-reference', observations[1][0], true, { text: `Customer mentioned Observation ID: ${observations[1][0]}` }],
      ['different-category', observations[1][0], true, { category: 'COMPLIANCE' }],
      ['different-subcategory', observations[1][0], true, { subCategory: 'LICENSE_REQUEST' }],
    ];
    for (const [id, observation, , options = {}] of cases) {
      await db.query('INSERT INTO helpdesk_tickets VALUES($1,$2,$3,$4,$5,$6)', [
        id, options.client ?? client, Object.hasOwn(options, 'branch') ? options.branch : branch,
        options.category ?? 'AUDIT', options.subCategory ?? 'AUDIT_OBSERVATION_CLOSURE',
        options.text ?? description(observation),
      ]);
    }
    const before = await db.query('SELECT * FROM helpdesk_tickets ORDER BY id');
    const visible = await db.query(`SELECT t.id FROM helpdesk_tickets t WHERE ${actualAuditRequestSql()} ORDER BY t.id`);
    assert.deepEqual(visible.rows.map(row => row.id), cases.filter(row => row[2]).map(row => row[0]).sort());
    const after = await db.query('SELECT * FROM helpdesk_tickets ORDER BY id');
    assert.deepEqual(after.rows, before.rows, 'Filtering must not alter or remove historical tickets');
    console.log(`PASS: ${cases.length} PostgreSQL isolation cases; all ticket rows preserved.`);
  } finally {
    await db.query('ROLLBACK');
    await db.end();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
