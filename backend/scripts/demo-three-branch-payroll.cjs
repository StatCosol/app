require('reflect-metadata');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const { DataSource } = require('typeorm');
const { getRepositoryToken } = require('@nestjs/typeorm');
const {
  PayrollEngineService,
} = require('../src/payroll/engine/payroll-engine.service');
const {
  PayrollProcessingService,
} = require('../src/payroll/payroll-processing.service');
const {
  PayrollApprovalService,
} = require('../src/payroll/payroll-approval.service');
const {
  RegisterBuilderService,
} = require('../src/payroll/register-library/register-builder.service');
const {
  REGISTER_FORMS,
} = require('../src/payroll/register-library/register-catalogue');
const {
  definition,
  validateRegister,
} = require('../src/payroll/register-library/register-workbook');
(async () => {
  const backend = path.resolve(__dirname, '..');
  const out = path.resolve(backend, '../tmp-art/demo-three-branches');
  await fs.mkdir(out, { recursive: true });
  const conn = {
    type: 'postgres',
    host: '127.0.0.1',
    port: 55439,
    username: 'register_test',
  };
  const control = new DataSource({ ...conn, database: 'postgres' });
  await control.initialize();
  const database = 'statco_demo_' + randomUUID().replaceAll('-', '');
  await control.query('CREATE DATABASE ' + database);
  await control.destroy();
  const ds = new DataSource({
    ...conn,
    database,
    entities: [path.join(backend, 'src/**/*.entity.ts')],
    synchronize: false,
  });
  await ds.initialize();
  await ds.synchronize();
  const repo = (name) =>
    ds.getRepository(ds.entityMetadatas.find((m) => m.name === name).target);
  const instances = new Map([[DataSource, ds]]);
  function resolve(K) {
    if (instances.has(K)) return instances.get(K);
    const types = Reflect.getMetadata('design:paramtypes', K) || [];
    const tokens = Reflect.getMetadata('self:paramtypes', K) || [];
    const args = types.map((T, i) => {
      const token = tokens.find((t) => t.index === i)?.param;
      const meta = ds.entityMetadatas.find(
        (m) => getRepositoryToken(m.target) === token,
      );
      return meta ? ds.getRepository(meta.target) : resolve(T);
    });
    const instance = new K(...args);
    instances.set(K, instance);
    return instance;
  }
  const admin = { id: randomUUID(), roleCode: 'ADMIN' },
    cco = { id: randomUUID(), roleCode: 'CCO' };
  try {
    const client = await repo('ClientEntity').save({
      clientCode: 'DEMO3',
      clientName: 'DEMO - Three State Payroll Services',
      status: 'ACTIVE',
      registeredAddress: 'Fictional demonstration address',
      industry: 'Demo office services',
    });
    const setup = await repo('PayrollClientSetupEntity').save({
      clientId: client.id,
      pfEnabled: true,
      esiEnabled: true,
      ptEnabled: false,
      lwfEnabled: false,
      pfEmployeeRate: 12,
      pfEmployerRate: 13,
      esiEmployeeRate: 0.75,
      esiEmployerRate: 3.25,
      pfWageCeiling: 15000,
      esiWageCeiling: 21000,
      pfGrossThreshold: 999999,
      wageBasisDays: 'CALENDAR_DAYS',
      otMultiplier: 2,
    });
    const components = [];
    for (const [code, name, type, pf, esi] of [
      ['BASIC', 'Basic', 'EARNING', true, true],
      ['HRA', 'House rent allowance', 'EARNING', false, true],
      ['PF_EMP', 'Employee PF', 'DEDUCTION', false, false],
      ['ESI_EMP', 'Employee ESI', 'DEDUCTION', false, false],
    ])
      components.push(
        await repo('PayrollComponentEntity').save({
          clientId: client.id,
          code,
          name,
          componentType: type,
          affectsPfWage: pf,
          affectsEsiWage: esi,
          displayOrder: components.length,
        }),
      );
    const rule = await repo('PayRuleSetEntity').save({
      clientId: client.id,
      name: 'DEMO configuration - not statutory advice',
      effectiveFrom: '2026-09-01',
    });
    const summary = {
      database,
      client,
      period: '2026-09',
      assumptions: [
        'Fictional local demo only; no live tenant or payments created.',
        'Rates are demonstration inputs, not verified statutory advice. PT/LWF disabled for this calculation demo.',
        'September 2026, calendar-day divisor, zero leave and overtime.',
        'Registers are unsigned demonstration records; payment references do not represent bank transfers.',
      ],
      branches: [],
    };
    for (const [index, state, city, basic, hra] of [
      [1, 'TS', 'Hyderabad', 16000, 2000],
      [2, 'AP', 'Vijayawada', 17000, 3000],
      [3, 'MH', 'Pune', 18000, 3000],
    ]) {
      const branch = await repo('BranchEntity').save({
        clientId: client.id,
        branchCode: 'DEMO-' + state,
        branchName: 'DEMO ' + city,
        branchType: 'BRANCH',
        stateCode: state,
        city,
        address: 'Fictional ' + city + ' demonstration office',
        headcount: 3,
        employeeCount: 3,
      });
      const structure = await repo('PaySalaryStructureEntity').save({
        clientId: client.id,
        branchId: branch.id,
        name: 'DEMO ' + state + ' salary structure',
        scopeType: 'BRANCH',
        ruleSetId: rule.id,
        effectiveFrom: '2026-09-01',
        approvalStatus: 'APPROVED',
        approvedById: cco.id,
        approvedAt: new Date(),
      });
      for (const [i, amount] of [
        [0, basic],
        [1, hra],
      ])
        await repo('PaySalaryStructureItemEntity').save({
          structureId: structure.id,
          componentId: components[i].id,
          calcMethod: 'FIXED',
          fixedAmount: amount,
          priority: i,
        });
      const run = await repo('PayrollRunEntity').save({
        clientId: client.id,
        branchId: branch.id,
        periodYear: 2026,
        periodMonth: 9,
        title: 'DEMO ' + state + ' September payroll',
      });
      const employees = [];
      for (let n = 1; n <= 3; n++) {
        const employee = await repo('EmployeeEntity').save({
          clientId: client.id,
          branchId: branch.id,
          employeeCode: `DEMO-${state}-${n}`,
          name: `Demo ${state} Employee ${n}`,
          fatherName: 'Fictional Parent',
          dateOfBirth: '1991-01-01',
          dateOfJoining: '2026-01-01',
          gender: 'M',
          designation: 'Office Assistant',
          approvalStatus: 'APPROVED',
          monthlyGross: basic + hra,
          pfApplicable: true,
          esiApplicable: true,
          pfServiceStartDate: '2010-01-01',
          basicAtPfStart: 6000,
          stateCode: state,
          bankAccount: `000000000${index}${n}`,
          uan: `0000000000${index}${n}`,
          esic: `0000000${index}${n}`,
        });
        employees.push(employee);
        await repo('PayrollRunEmployeeEntity').save({
          runId: run.id,
          clientId: client.id,
          branchId: branch.id,
          employeeId: employee.id,
          employeeCode: employee.employeeCode,
          employeeName: employee.name,
          designation: employee.designation,
          stateCode: state,
          uan: employee.uan,
          esic: employee.esic,
        });
      }
      const csv =
        'Employee Code,Working Days,Payable Days,Approved Leaves,OT Hours\n' +
        employees.map((e) => `${e.employeeCode},30,30,0,0`).join('\n');
      const attendancePath = path.join(out, state + '-attendance.csv');
      await fs.writeFile(attendancePath, csv);
      const processing = resolve(PayrollProcessingService);
      await processing.uploadAttendance(run.id, {
        path: attendancePath,
        originalname: state + '-attendance.csv',
      });
      assert.equal(
        await repo('LeaveBalanceEntity').count({
          where: { clientId: client.id, year: 2026 },
        }),
        index * 6,
        'Attendance import must persist both leave balances',
      );
      const result = await resolve(PayrollEngineService).processWithEngine(
        run.id,
      );
      assert.equal(result.status, 'PROCESSED', JSON.stringify(result));
      assert.equal(result.processed, 3);
      const approval = resolve(PayrollApprovalService);
      await approval.submitForApproval(run.id, admin.id, admin);
      await approval.approveRun(
        run.id,
        cco.id,
        'Fictional demo approval only',
        cco,
      );
      const payroll = await repo('PayrollRunEmployeeEntity').find({
        where: { runId: run.id },
        order: { employeeCode: 'ASC' },
      });
      const componentValues = await repo('PayrollRunComponentValueEntity').find(
        { where: { runId: run.id } },
      );
      for (const e of payroll) {
        assert.ok(Number(e.grossEarnings) > 0);
        assert.equal(
          Math.round(
            (Number(e.grossEarnings) -
              Number(e.totalDeductions) -
              Number(e.netPay)) *
              100,
          ),
          0,
        );
        assert.equal(e.branchId, branch.id);
      }
      summary.branches.push({
        branch,
        runId: run.id,
        status: (await repo('PayrollRunEntity').findOneBy({ id: run.id }))
          .status,
        employees,
        payroll,
        componentValues,
        files: [],
      });
    }
    await fs.writeFile(
      path.join(out, 'demo-data.json'),
      JSON.stringify(summary, null, 2),
    );
    console.log(
      JSON.stringify(
        {
          database,
          output: out,
          branches: summary.branches.map((b) => ({
            state: b.branch.stateCode,
            status: b.status,
            employees: b.payroll.length,
            gross: b.payroll.reduce((s, e) => s + Number(e.grossEarnings), 0),
            net: b.payroll.reduce((s, e) => s + Number(e.netPay), 0),
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await ds.destroy();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
