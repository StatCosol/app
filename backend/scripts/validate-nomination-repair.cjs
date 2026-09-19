// After backend build; disposable local database only. Never reads production credentials.
//
// Runs scripts/repair-nominee-less-nominations.mjs as a subprocess against a
// throwaway schema whose tables come from the real entities, and checks that:
// the dry run writes nothing; --apply rejects only SUBMITTED/APPROVED
// nominations with no nominees inside the bug window; drafts, nominations with
// nominees and anything older are untouched; --delete-orphans removes only
// superseded client-side drafts; and a second --apply changes nothing.
const assert = require('node:assert/strict'),
  path = require('node:path'),
  { spawnSync } = require('node:child_process');
const { Client } = require('pg'),
  { DataSource, Table } = require('typeorm');
const {
  EmployeeNominationEntity,
} = require('../dist/src/employees/entities/employee-nomination.entity');
const {
  EmployeeNominationMemberEntity,
} = require('../dist/src/employees/entities/employee-nomination-member.entity');
const {
  AppraisalCycleScopeEntity,
} = require('../dist/src/performance-appraisal/entities/appraisal-cycle-scope.entity');

const connection = {
  host: '127.0.0.1',
  port: Number(process.env.AUTOMATION_TEST_PORT || 55439),
  user: process.env.AUTOMATION_TEST_USER || 'monthly_close_test',
  password: process.env.AUTOMATION_TEST_PASSWORD || undefined,
  database: process.env.AUTOMATION_TEST_DATABASE || 'postgres',
};
const schema = `nomination_repair_${Date.now()}`,
  id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SCRIPT = path.join(__dirname, 'repair-nominee-less-nominations.mjs');

function repair(...args) {
  const run = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DB_HOST: connection.host,
      DB_PORT: String(connection.port),
      DB_USER: connection.user,
      DB_PASS: connection.password || '',
      DB_NAME: connection.database,
      DB_SSL: 'false',
      DB_SSL_CA_PATH: '',
      PGOPTIONS: `-c search_path=${schema}`,
    },
  });
  const blocks = (run.stdout.match(/^\{[\s\S]*?^\}$/gm) || []).map((b) =>
    JSON.parse(b),
  );
  return { status: run.status, stdout: run.stdout, stderr: run.stderr, blocks };
}

async function main() {
  const admin = new Client(connection);
  await admin.connect();
  let ds;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    ds = new DataSource({
      type: 'postgres',
      ...connection,
      username: connection.user,
      schema,
      extra: { options: `-c search_path=${schema},public` },
      entities: [path.join(__dirname, '../dist/src/**/*.entity.js')],
      synchronize: false,
    });
    await ds.initialize();
    const runner = ds.createQueryRunner();
    try {
      for (const entity of [
        EmployeeNominationEntity,
        EmployeeNominationMemberEntity,
        AppraisalCycleScopeEntity,
      ])
        await runner.createTable(
          Table.create(ds.getMetadata(entity), ds.driver),
          true,
        );
    } finally {
      await runner.release();
    }

    const CLIENT = id(900),
      EMP_A = id(901),
      EMP_B = id(902),
      APPROVER = id(903);
    const nomination = (n, over) =>
      ds.query(
        `INSERT INTO employee_nominations
           (id, employee_id, client_id, nomination_type, status,
            approved_at, approved_by_user_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id(n),
          over.employee ?? EMP_A,
          over.client === undefined ? CLIENT : over.client,
          over.type ?? 'PF',
          over.status,
          over.approvedAt ?? null,
          over.approvedBy ?? null,
          over.created,
        ],
      );
    const member = (n) =>
      ds.query(
        `INSERT INTO employee_nomination_members (id, nomination_id, member_name)
         VALUES ($1, $2, 'Synthetic Nominee')`,
        [id(500 + n), id(n)],
      );

    // ESS path (client_id set)
    await nomination(1, { status: 'SUBMITTED', created: '2026-06-01' }); // empty → reject
    await nomination(2, {
      status: 'APPROVED',
      created: '2026-07-01',
      type: 'ESI',
      approvedAt: '2026-07-02',
      approvedBy: APPROVER,
    }); // empty → reject, approval kept for audit
    await nomination(3, { status: 'SUBMITTED', created: '2026-06-02', type: 'GRATUITY' });
    await member(3); // has nominees → untouched
    await nomination(4, { status: 'DRAFT', created: '2026-06-05', type: 'INSURANCE' }); // draft → untouched
    await nomination(5, { status: 'SUBMITTED', created: '2026-04-01', type: 'SALARY' }); // before window → untouched
    // Client/admin path (client_id NULL): failed attempts left empty drafts
    await nomination(6, { status: 'DRAFT', created: '2026-06-03', client: null, employee: EMP_B }); // superseded by 7
    await nomination(7, { status: 'DRAFT', created: '2026-06-04', client: null, employee: EMP_B });
    await member(7);
    await nomination(8, {
      status: 'DRAFT',
      created: '2026-06-06',
      client: null,
      employee: EMP_B,
      type: 'ESI',
    }); // empty, not superseded → kept
    await ds.query(
      `INSERT INTO appraisal_cycle_scopes (id, cycle_id) VALUES ($1, $2)`,
      [id(951), id(950)],
    );

    const snapshot = async () =>
      JSON.stringify(
        await ds.query(
          `SELECT id, status, rejection_reason, approved_by_user_id
             FROM employee_nominations ORDER BY id`,
        ),
      );
    const state = async (n) =>
      (
        await ds.query(
          `SELECT status, rejection_reason, approved_by_user_id
             FROM employee_nominations WHERE id = $1`,
          [id(n)],
        )
      )[0];

    // --delete-orphans alone is refused
    const lone = repair('--delete-orphans');
    assert.equal(lone.status, 2, lone.stderr);

    // Dry run: reports, writes nothing
    const before = await snapshot();
    const dry = repair();
    assert.equal(dry.status, 0, dry.stderr);
    assert.equal(await snapshot(), before, 'dry run must not write');
    const report = dry.blocks[0];
    assert.equal(report.mode, 'dry-run');
    assert.deepEqual(
      report.affected.map((r) => r.id).sort(),
      [id(1), id(2), id(4), id(6), id(8)].sort(),
    );
    assert.equal(report.noNomineesBeforeWindow, 1);
    assert.equal(report.appraisalScopesAllNull, 1);
    assert.equal(
      report.affected.find((r) => r.id === id(6)).superseded,
      true,
    );
    assert.ok(!JSON.stringify(report).includes('Synthetic Nominee'), 'no names in the report');

    // Apply
    const applied = repair('--apply');
    assert.equal(applied.status, 0, applied.stderr);
    assert.deepEqual(applied.blocks[1], {
      rejectedForResubmission: 2,
      orphanDraftsDeleted: 0,
    });
    for (const n of [1, 2]) {
      const s = await state(n);
      assert.equal(s.status, 'REJECTED');
      assert.match(s.rejection_reason, /add your nominees again/);
    }
    assert.equal((await state(2)).approved_by_user_id, APPROVER);
    assert.equal((await state(3)).status, 'SUBMITTED');
    assert.equal((await state(4)).status, 'DRAFT');
    assert.equal((await state(5)).status, 'SUBMITTED');
    assert.equal((await state(6)).status, 'DRAFT');

    // Orphan cleanup: only the superseded client-side draft goes
    const cleaned = repair('--apply', '--delete-orphans');
    assert.equal(cleaned.status, 0, cleaned.stderr);
    assert.deepEqual(cleaned.blocks[1], {
      rejectedForResubmission: 0,
      orphanDraftsDeleted: 1,
    });
    assert.equal(await state(6), undefined);
    assert.equal((await state(7)).status, 'DRAFT');
    assert.equal((await state(8)).status, 'DRAFT');

    // Idempotent
    const again = repair('--apply', '--delete-orphans');
    assert.deepEqual(again.blocks[1], {
      rejectedForResubmission: 0,
      orphanDraftsDeleted: 0,
    });

    console.log(
      'PASS: dry run writes nothing and names no one; --apply rejects only empty SUBMITTED/APPROVED nominations in the window (approval kept for audit); drafts, nominated and older rows untouched; --delete-orphans removes only superseded client-side drafts; re-running changes nothing.',
    );
  } finally {
    if (ds?.isInitialized) await ds.destroy();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
