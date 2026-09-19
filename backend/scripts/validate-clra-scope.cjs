// After backend build; disposable local database only. Never reads production credentials.
//
// CLRA list scoping against real Postgres. The unit specs mock the query
// builder, so they cannot tell whether the SQL — in particular the
// contractor EXISTS subquery and the branch clause — actually runs and filters.
// Two companies, one shared contractor, one contractor per company, one
// unassigned contractor; each caller must see exactly its own.
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { DataSource } = require('typeorm');
const {
  ClraPeEstablishment,
} = require('../dist/src/contractor/entities/clra-pe-establishment.entity');
const {
  ClraContractor,
} = require('../dist/src/contractor/entities/clra-contractor.entity');
const {
  ClraContractorAssignment,
} = require('../dist/src/contractor/entities/clra-contractor-assignment.entity');
const {
  ClraContractorWorker,
} = require('../dist/src/contractor/entities/clra-contractor-worker.entity');
const {
  ClraWorkerDeployment,
} = require('../dist/src/contractor/entities/clra-worker-deployment.entity');
const {
  ClraWagePeriod,
} = require('../dist/src/contractor/entities/clra-wage-period.entity');
const { ClraAttendance } = require('../dist/src/contractor/entities/clra-attendance.entity');
const { ClraWage } = require('../dist/src/contractor/entities/clra-wage.entity');
const {
  ClraRegisterRun,
} = require('../dist/src/contractor/entities/clra-register-run.entity');
const {
  ClraAssignmentsService,
} = require('../dist/src/contractor/clra-assignments.service');

const connection = {
  host: '127.0.0.1',
  port: Number(process.env.AUTOMATION_TEST_PORT || 55439),
  user: process.env.AUTOMATION_TEST_USER || 'monthly_close_test',
  password: process.env.AUTOMATION_TEST_PASSWORD || undefined,
  database: process.env.AUTOMATION_TEST_DATABASE || 'postgres',
};
const schema = `clra_scope_${Date.now()}`;
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ENTITIES = [
  ClraPeEstablishment,
  ClraContractor,
  ClraContractorAssignment,
  ClraContractorWorker,
  ClraWorkerDeployment,
  ClraWagePeriod,
  ClraAttendance,
  ClraWage,
  ClraRegisterRun,
];

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
      entities: ENTITIES,
      synchronize: true,
    });
    await ds.initialize();
    const svc = new ClraAssignmentsService(
      ...ENTITIES.map((e) => ds.getRepository(e)),
      ds,
    );

    const A = id(1), B = id(2), BR_A1 = id(11), BR_A2 = id(12);
    const pe = (n, clientId, branchId) =>
      ds.getRepository(ClraPeEstablishment).save({
        id: id(n), clientId, branchId, peName: `PE ${n}`,
        establishmentName: `Est ${n}`, stateCode: 'TS', active: true,
      });
    const contractor = (n) =>
      ds.getRepository(ClraContractor).save({
        id: id(n), contractorCode: `C${n}`, legalName: `Contractor ${n}`, active: true,
      });
    const assign = (n, contractorId, peEstablishmentId) =>
      ds.getRepository(ClraContractorAssignment).save({
        id: id(n), contractorId, peEstablishmentId, assignmentCode: `A${n}`,
        natureOfWork: 'Housekeeping', stateCode: 'TS', startDate: '2026-01-01',
      });

    await pe(21, A, BR_A1); // company A, branch A1
    await pe(22, A, null); // company A, company-wide
    await pe(23, B, null); // company B
    await contractor(31); // assigned at A only
    await contractor(32); // assigned at B only
    await contractor(33); // assigned at both
    await contractor(34); // assigned nowhere
    await assign(41, id(31), id(21));
    await assign(42, id(32), id(23));
    await assign(43, id(33), id(22));
    await assign(44, id(33), id(23));

    const ids = (rows) => rows.map((r) => r.id).sort();
    const scopeA = { clientIds: [A] };

    // PE establishments — the list that returned every company's when clientId was omitted.
    assert.deepEqual(ids(await svc.listPeEstablishments(undefined, scopeA)), [id(21), id(22)]);
    assert.deepEqual(ids(await svc.listPeEstablishments(undefined, null)), [id(21), id(22), id(23)]);
    assert.deepEqual(await svc.listPeEstablishments(undefined, { clientIds: [] }), []);
    // A branch user of A1 sees A1's PE and the company-wide one, not another branch's.
    assert.deepEqual(
      ids(await svc.listPeEstablishments(undefined, { clientIds: [A], branchIds: [BR_A2] })),
      [id(22)],
    );
    assert.deepEqual(
      ids(await svc.listPeEstablishments(undefined, { clientIds: [A], branchIds: [BR_A1] })),
      [id(21), id(22)],
    );

    // Contractors — the list that had no filter at all.
    assert.deepEqual(ids(await svc.listContractors(scopeA)), [id(31), id(33)]);
    assert.deepEqual(ids(await svc.listContractors(scopeA, true)), [id(31), id(33), id(34)]);
    assert.deepEqual(ids(await svc.listContractors(null)), [id(31), id(32), id(33), id(34)]);
    assert.deepEqual(await svc.listContractors({ clientIds: [] }), []);

    // Assignments — returned every company's with no filter.
    assert.deepEqual(ids(await svc.listAssignments(undefined, undefined, scopeA)), [id(41), id(43)]);
    assert.deepEqual(
      ids(await svc.listAssignments(id(33), undefined, { clientIds: [B] })),
      [id(44)],
    );
    assert.equal((await svc.listAssignments(undefined, undefined, null)).length, 4);

    console.log(
      'PASS: CLRA lists — PEs, contractors (shared, own, unassigned-for-CRM) and assignments — are limited to the caller’s clients and branches on real Postgres; global roles still see all; an empty scope sees nothing.',
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
