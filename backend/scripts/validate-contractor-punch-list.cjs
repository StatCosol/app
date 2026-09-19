// After backend build; disposable local database only. Never reads production credentials.
//
// The Contractor Attendance list on real Postgres: the employee/contractor
// joins, the derived source, the FaceDesk match_cosine fallback, the
// contractor filter and a branch user's scope — where a manual punch has no
// branch of its own and takes the employee's.
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { DataSource } = require('typeorm');
const {
  ContractorBiometricPunchEntity,
} = require('../dist/src/mobile-attendance/punch/contractor-punch.entity');
const {
  PunchContractorAdminService,
} = require('../dist/src/mobile-attendance/punch/punch-contractor-admin.service');

const connection = {
  host: '127.0.0.1',
  port: Number(process.env.AUTOMATION_TEST_PORT || 55439),
  user: process.env.AUTOMATION_TEST_USER || 'monthly_close_test',
  password: process.env.AUTOMATION_TEST_PASSWORD || undefined,
  database: process.env.AUTOMATION_TEST_DATABASE || 'postgres',
};
const schema = `contractor_punch_${Date.now()}`;
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ZERO = '00000000-0000-0000-0000-000000000000';

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
      entities: [ContractorBiometricPunchEntity],
      synchronize: true,
    });
    await ds.initialize();
    // Only the columns the list reads, from the real tables' definitions.
    await ds.query(`CREATE TABLE users (id uuid PRIMARY KEY, name varchar NOT NULL)`);
    await ds.query(`CREATE TABLE contractor_employees (
      id uuid PRIMARY KEY, client_id uuid NOT NULL, branch_id uuid NOT NULL,
      contractor_user_id uuid NOT NULL, name varchar(250) NOT NULL,
      employee_code varchar(50))`);

    const C = id(1), BR1 = id(11), BR2 = id(12), CU = id(21), CU2 = id(22);
    await ds.query(`INSERT INTO users VALUES ($1,'Jilkari Shiva Kumar'),($2,'Other Contractor')`, [CU, CU2]);
    await ds.query(
      `INSERT INTO contractor_employees VALUES
        ($1,$4,$5,$6,'Ravi','SBS0001'),
        ($2,$4,$7,$6,'Lakshmi','SBS0002'),
        ($3,$4,$5,$8,'Other Worker','SBE0001')`,
      [id(31), id(32), id(33), C, BR1, CU, BR2, CU2],
    );
    const repo = ds.getRepository(ContractorBiometricPunchEntity);
    const punch = (n, emp, extra) =>
      repo.save({
        id: id(n), clientId: C, contractorEmployeeId: emp, deviceId: ZERO,
        direction: 'IN', punchTime: new Date(`2026-09-19T0${n % 10}:00:00Z`),
        ...extra,
      });
    await punch(41, id(31), { branchId: BR1, matchCosine: 0.87, livenessScore: 0.99, photoUrl: 'a.jpg' }); // FaceDesk
    await punch(42, id(31), { branchId: BR1, direction: 'OUT' }); // manual
    await punch(43, id(32), { branchId: null }); // manual, no branch → employee's BR2
    await punch(44, id(33), { branchId: BR1, deviceId: id(90) }); // biometric device
    const svc = new PunchContractorAdminService(repo);

    const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));
    const all = byId(await svc.listContractorPunches(C, {}));
    assert.equal(Object.keys(all).length, 4);
    assert.equal(all[id(41)].contractorEmployeeName, 'Ravi');
    assert.equal(all[id(41)].employeeCode, 'SBS0001');
    assert.equal(all[id(41)].contractorName, 'Jilkari Shiva Kumar');
    assert.equal(all[id(41)].source, 'FACE');
    assert.equal(Number(all[id(41)].matchScore), 0.87); // match_cosine fallback
    assert.equal(all[id(42)].source, 'MANUAL');
    assert.equal(all[id(44)].source, 'DEVICE');
    assert.equal(all[id(43)].branchId, BR2); // took the employee's branch

    // The contractor dropdown on the screen.
    const mine = await svc.listContractorPunches(C, { contractorUserId: CU });
    assert.deepEqual(mine.map((r) => r.id).sort(), [id(41), id(42), id(43)]);

    // A branch user of BR1 sees BR1 only — including the branchless manual
    // punch of a BR2 employee staying out.
    const br1 = await svc.listContractorPunches(C, {}, [BR1]);
    assert.deepEqual(br1.map((r) => r.id).sort(), [id(41), id(42), id(44)]);
    assert.deepEqual(await svc.listContractorPunches(C, {}, []), []);

    // Another client sees nothing.
    assert.deepEqual(await svc.listContractorPunches(id(2), {}), []);

    console.log(
      'PASS: contractor punches list on real Postgres — names, codes, contractor, source (face/manual/device), FaceDesk cosine as match, contractor filter, and branch scope with branchless manual punches.',
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
