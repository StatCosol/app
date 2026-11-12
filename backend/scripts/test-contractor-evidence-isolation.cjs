/* Local-only regression: real PostgreSQL queries, temporary tables, rollback. */
const assert = require('node:assert/strict');
const { Client } = require('pg');
const {
  LegitxDashboardService,
} = require('../dist/src/legitx/legitx-dashboard.service');
const {
  ContractorRequiredDocumentsService,
} = require('../dist/src/contractor/contractor-required-documents.service');
const {
  actualContractorDocumentSql,
} = require('../dist/src/common/actual-records');
const db = new Client({
  host: '127.0.0.1',
  port: Number(process.env.AUTOMATION_TEST_PORT || 55439),
  user: process.env.AUTOMATION_TEST_USER || 'monthly_close_test',
  password: process.env.AUTOMATION_TEST_PASSWORD || undefined,
  database: process.env.AUTOMATION_TEST_DATABASE || 'postgres',
});
const c = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const u = '44444444-4444-4444-8444-444444444444';
const checks = [];
(async () => {
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query(
      'CREATE TEMP TABLE contractor_documents(id text, client_id uuid, branch_id uuid, contractor_user_id uuid, file_name text, title text, status text, doc_type text, doc_month text, created_at timestamptz, review_notes text) ON COMMIT DROP',
    );
    const insert = async (id, file, title, branch = b, month = '2025-12') =>
      db.query(
        "INSERT INTO contractor_documents VALUES($1,$2,$3,$4,$5,$6,'APPROVED','BANK_PAYMENT_PROOF',$7,'2025-12-15',NULL)",
        [id, c, branch, u, file, title, month],
      );
    await insert('real', 'bank-original.pdf', 'Actual bank proof');
    await insert(
      'ordinary',
      'Test certificate.pdf',
      'Laboratory test certificate',
    );
    await insert('other-branch', 'bank-other.pdf', 'Actual', other);
    await insert('other-month', 'bank-november.pdf', 'Actual', b, '2025-11');
    const query = async (sql, args) => (await db.query(sql, args)).rows;
    const dashboard = new LegitxDashboardService({ many: query });
    const scope = { clientId: c, branchId: b, contractorId: u };
    const baseline = await dashboard.getContractorDocsBuckets(scope);
    assert.equal(
      baseline.values.reduce((a, b) => a + b, 0),
      3,
    );
    const repo = {
      find: async () => [{ docType: 'BANK_PAYMENT_PROOF', branchId: b }],
      manager: {
        query: async (sql, args) => {
          if (sql.includes('information_schema')) return [{ exists: 1 }];
          return query(sql, args);
        },
      },
    };
    const checklist = new ContractorRequiredDocumentsService(repo, {
      find: async () => [{ branchId: b }],
    });
    const baselineList = await checklist.getContractorChecklist(
      u,
      c,
      '2025-12',
      b,
    );
    assert.equal(
      baselineList.items.find((x) => x.docType === 'BANK_PAYMENT_PROOF')
        .uploadedDocs.length,
      2,
    );
    for (const [id, name, title] of [
      ['test-hyphen', 'TEST-ONLY-correction.pdf', 'Synthetic evidence'],
      ['test-underscore', 'test_bank.pdf', 'Synthetic evidence'],
      ['test-title', 'proof.pdf', 'SYNTHETIC TEST ONLY correction'],
      ['test-space', 'TEST ONLY bank.pdf', 'Synthetic evidence'],
    ])
      await insert(id, name, title);
    for (const status of [
      'PENDING_REVIEW',
      'REJECTED',
      'PENDING_REVIEW',
      'APPROVED',
      'EXPIRED',
    ]) {
      await db.query(
        "UPDATE contractor_documents SET status=$1 WHERE id LIKE 'test-%'",
        [status],
      );
      assert.deepEqual(
        await dashboard.getContractorDocsBuckets(scope),
        baseline,
      );
      assert.deepEqual(
        await checklist.getContractorChecklist(u, c, '2025-12', b),
        baselineList,
      );
      checks.push('Dashboard and checklist unchanged during ' + status);
    }
    // Test evidence remains available by ID for CRM review/correction.
    assert.equal(
      (await query("SELECT * FROM contractor_documents WHERE id LIKE 'test-%'"))
        .length,
      4,
    );
    checks.push('Four test records preserved for explicit review');
    const otherScope = await dashboard.getContractorDocsBuckets({
      ...scope,
      branchId: other,
    });
    assert.equal(
      otherScope.values.reduce((a, b) => a + b, 0),
      1,
    );
    const november = await checklist.getContractorChecklist(u, c, '2025-11', b);
    assert.equal(
      november.items.find((x) => x.docType === 'BANK_PAYMENT_PROOF')
        .uploadedDocs.length,
      1,
    );
    checks.push('Branch and month boundaries retained');
    const actual = await query(
      'SELECT id FROM contractor_documents WHERE ' +
        actualContractorDocumentSql() +
        ' ORDER BY id',
    );
    assert.deepEqual(
      actual.map((x) => x.id),
      ['ordinary', 'other-branch', 'other-month', 'real'],
    );
    checks.push(
      'All ordinary evidence retained, including Test certificate.pdf',
    );

    // Exercise the real CRM list, counters and review methods using only temp tables.
    const {
      CrmContractorDocumentsController,
    } = require('../dist/src/crm/crm-contractor-documents.controller');
    await db.query(
      'ALTER TABLE contractor_documents ADD file_path text, ADD file_type text, ADD expiry_date date, ADD reviewed_at timestamptz, ADD reviewed_by_user_id uuid',
    );
    await db.query(
      'CREATE TEMP TABLE clients(id uuid,client_name text); CREATE TEMP TABLE client_branches(id uuid,branchname text); CREATE TEMP TABLE users(id uuid,name text); CREATE TEMP TABLE client_assignments_current(client_id uuid,assigned_to_user_id uuid,assignment_type text)',
    );
    await db.query(
      "CREATE TYPE pg_temp.contractor_document_status AS ENUM ('PENDING_REVIEW','APPROVED','REJECTED','EXPIRED')",
    );
    const crmId = '55555555-5555-4555-8555-555555555555';
    await db.query("INSERT INTO clients VALUES($1,'Fixture company')", [c]);
    await db.query(
      "INSERT INTO client_branches VALUES($1,'Fixture branch'),($2,'Other branch')",
      [b, other],
    );
    await db.query("INSERT INTO users VALUES($1,'Fixture vendor')", [u]);
    await db.query(
      "INSERT INTO client_assignments_current VALUES($1,$2,'CRM')",
      [c, crmId],
    );
    const crm = new CrmContractorDocumentsController({ many: query });
    const actualKpis = await crm.kpis({ id: crmId });
    assert.equal(Number(actualKpis.approved), 4);
    assert.equal((await crm.list({ id: crmId }, {})).data.length, 4);
    assert.equal(
      (await crm.list({ id: crmId }, { recordScope: 'TEST' })).data.length,
      4,
    );
    assert.equal(
      (await crm.list({ id: other }, { recordScope: 'TEST' })).data.length,
      0,
    );
    await assert.rejects(
      crm.kpis({ id: crmId }, { recordScope: 'ALL' }),
      /Invalid record scope/,
    );
    await assert.rejects(
      crm.review({ id: other }, 'test-hyphen', { status: 'APPROVED' }),
      /not in your scope/,
    );
    for (const status of ['REJECTED', 'APPROVED']) {
      await crm.review({ id: crmId }, 'test-hyphen', {
        status,
        reviewNotes: 'TEST ONLY review',
      });
      assert.deepEqual(await crm.kpis({ id: crmId }), actualKpis);
      assert.equal(
        (
          await crm.list({ id: crmId }, { recordScope: 'TEST', status })
        ).data.some((d) => d.id === 'test-hyphen'),
        true,
      );
      assert.deepEqual(
        await dashboard.getContractorDocsBuckets(scope),
        baseline,
      );
    }
    checks.push(
      'CRM actual/test lists and counters isolated through rejection and approval',
    );
    checks.push(
      'CRM test scope preserves assignment permissions and rejects invalid scope',
    );
    console.log(
      JSON.stringify(
        {
          passed: checks.length,
          checks,
          productionWrites: 0,
          cleanup: 'transaction rollback',
        },
        null,
        2,
      ),
    );
  } finally {
    await db.query('ROLLBACK');
    await db.end();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
