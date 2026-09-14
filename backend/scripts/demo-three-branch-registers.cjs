require('reflect-metadata');
const fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { DataSource } = require('typeorm');
const {
  RegisterBuilderService,
} = require('../src/payroll/register-library/register-builder.service');
const { AccessScopeService } = require('../src/access/access-scope.service');
const {
  REGISTER_FORMS,
} = require('../src/payroll/register-library/register-catalogue');
const {
  definition,
  validateRegister,
} = require('../src/payroll/register-library/register-workbook');
(async () => {
  const backend = path.resolve(__dirname, '..'),
    out = path.resolve(backend, '../tmp-art/demo-three-branches');
  const summary = JSON.parse(
    await fs.readFile(path.join(out, 'demo-data.json'), 'utf8'),
  );
  assert.match(summary.database, /^statco_demo_[a-f0-9]{32}$/);
  const ds = new DataSource({
    type: 'postgres',
    host: '127.0.0.1',
    port: 55439,
    username: 'register_test',
    database: summary.database,
    entities: [path.join(backend, 'src/**/*.entity.ts')],
    synchronize: false,
  });
  await ds.initialize();
  const repo = (n) =>
    ds.getRepository(ds.entityMetadatas.find((m) => m.name === n).target);
  const access = new AccessScopeService(
    ...[
      'ClientAssignment',
      'BranchAuditorAssignmentEntity',
      'ClientEntity',
      'BranchEntity',
      'PayrollClientAssignmentEntity',
    ].map(repo),
  );
  const builder = new RegisterBuilderService(ds, access),
    admin = { id: randomUUID(), roleCode: 'ADMIN' };
  const oldCwd = process.cwd();
  process.chdir(out);
  try {
    if (
      !(await repo('CompliancePackageEntity').findOneBy({
        code: 'DEFAULT_INDIA',
      }))
    )
      await repo('CompliancePackageEntity').save({
        code: 'DEFAULT_INDIA',
        name: 'Demo applicability package',
      });
    for (const file of [
      '20260920_register_jurisdiction.sql',
      '20260921_register_evidence.sql',
      '20260923_state_shops_registers.sql',
      '20260924_social_security_register_applicability.sql',
    ])
      await ds.query(
        await fs.readFile(path.join(backend, 'migrations', file), 'utf8'),
      );
    for (const b of summary.branches) {
      const state = b.branch.stateCode,
        folder = path.join(out, state);
      await fs.mkdir(folder, { recursive: true });
      const actCode =
        state === 'TS'
          ? 'TS_SHOPS_1988'
          : state === 'MH'
            ? 'SHOPS_2017'
            : 'WAGES_2019';
      await repo('UnitFactsEntity').upsert(
        {
          branchId: b.branch.id,
          stateCode: state,
          appropriateGovernment: 'STATE',
          employeeTotal: 3,
          employeeMale: 3,
          employeeFemale: 0,
        },
        ['branchId'],
      );
      const compliance = await repo('UnitComplianceMasterEntity').findOneBy({
        code: actCode,
      });
      const {
        UnitApplicabilityService,
      } = require('../src/units/services/unit-applicability.service');
      await new UnitApplicabilityService(
        repo('UnitApplicableComplianceEntity'),
        repo('UnitApplicabilityAuditEntity'),
        repo('UnitComplianceMasterEntity'),
      ).applyOverrides(
        b.branch.id,
        [
          {
            complianceId: compliance.id,
            isApplicable: true,
            reason:
              'Fictional demo applicability selection, not a legal determination',
          },
        ],
        admin.id,
      );
      assert.equal(
        (await builder.branchContext(b.branch.id, admin)).stateCode,
        state,
      );
      const forms = REGISTER_FORMS.filter((f) =>
        state === 'TS'
          ? f.actCode === actCode
          : state === 'MH'
            ? f.sourceId === 'mh' && f.formNumber === 'Q'
            : f.sourceId === 'apw' && ['IV', 'V'].includes(f.formNumber),
      );
      b.files = [];
      const csv = [
        'Employee Code,Employee Name,State,Days,Gross,PF,ESI,Total deductions,Net',
      ];
      for (const e of b.payroll) {
        const vals = Object.fromEntries(
          b.componentValues
            .filter((v) => v.runEmployeeId === e.id)
            .map((v) => [v.componentCode, Number(v.amount)]),
        );
        csv.push(
          [
            e.employeeCode,
            e.employeeName,
            state,
            e.daysPresent,
            e.grossEarnings,
            vals.PF_EMP,
            vals.ESI_EMP,
            e.totalDeductions,
            e.netPay,
          ].join(','),
        );
      }
      await fs.writeFile(
        path.join(folder, state + '-payroll.csv'),
        csv.join('\n'),
      );
      for (const form of forms) {
        const { layout } = definition(form.id);
        const input = {
          branchId: b.branch.id,
          year: 2026,
          month: 9,
          employer: summary.client.clientName,
          owner: 'Fictional Demo Owner',
          registrationNumber: 'DEMO-NOT-REGISTERED',
          employerPan: 'ABCDE1234F',
          issueDate: '2026-10-01',
          supportingReference:
            'DEMO ONLY - fictional attendance and approved payroll ' +
            b.runId +
            '; no payments made',
          rows: [],
        };
        const prefill = layout.payrollPrefill
          ? await builder.prefill(form.id, b.branch.id, b.runId, 2026, 9, admin)
          : null;
        for (const [i, e] of b.payroll.entries()) {
          const master = b.employees.find((m) => m.id === e.employeeId),
            vals = Object.fromEntries(
              b.componentValues
                .filter((v) => v.runEmployeeId === e.id)
                .map((v) => [v.componentCode, Number(v.amount)]),
            );
          const row = Object.fromEntries(
            layout.fields
              .filter((f) => f.required)
              .map((f) => [
                f.key,
                ['number', 'money'].includes(f.type)
                  ? 0
                  : f.type === 'date'
                    ? '2026-09-30'
                    : 'DEMO - not applicable',
              ]),
          );
          if (prefill) Object.assign(row, prefill.rows[i]);
          const facts = {
            serial: i + 1,
            employeeCode: e.employeeCode,
            name: e.employeeName + ' (' + e.employeeCode + ')',
            relativeName: master.fatherName,
            ageOrBirthDate: '1991-01-01',
            age: 35,
            sex: 'M',
            address: 'Fictional home address',
            educationSkill: 'Demo unskilled category',
            nominee: 'Fictional Nominee - demonstration only',
            designation: e.designation,
            department: 'Demo Office',
            frequency: 'Monthly',
            wagePeriod: '2026-09-01 to 2026-09-30',
            daysWorked: Number(e.daysPresent),
            leaveCategory: 'None',
            leaveDays: 0,
            leaveBalance: 1.5,
            wageRate:
              String(Number(vals.BASIC) + Number(vals.HRA)) +
              ' per month - demo',
            basicRate: vals.BASIC,
            daRate: 0,
            allowanceRate: vals.HRA,
            basic: vals.BASIC,
            actualWages: vals.BASIC,
            minimumRate: vals.BASIC,
            hra: vals.HRA,
            da: 0,
            allowances: vals.HRA,
            otHours: 0,
            overtime: 0,
            maternity: 0,
            otherAmount: 'None',
            gross: Number(e.grossEarnings),
            fine: 0,
            advanceDetails: 'None',
            pf: vals.PF_EMP,
            esi: vals.ESI_EMP,
            deductions: Number(e.totalDeductions),
            otherDeductions: state === 'TS' ? Number(e.totalDeductions) : 0,
            net: Number(e.netPay),
            bankAccount: master.bankAccount,
            uan: master.uan,
            joiningDate: master.dateOfJoining,
            workingFrom: '09:00',
            workingTo: '18:00',
            restFrom: '13:00',
            restTo: '14:00',
            paymentDate: '2026-10-01',
            receipt: 'DEMO-NO-PAYMENT',
            transferReference: 'DEMO-NO-PAYMENT',
            deposited: 0,
            remarks: 'Fictional demo only; unpaid and unsigned',
          };
          const allowed = new Set(layout.fields.map((f) => f.key));
          for (const [k, v] of Object.entries(facts))
            if (allowed.has(k)) row[k] = v;
          if (state === 'MH')
            for (let day = 1; day <= 30; day++)
              row['day' + day + 'Status'] = 'P';
          input.rows.push(row);
        }
        if (layout.particulars) {
          input.actingCapacity = 'DIRECT_EMPLOYER';
          input.particulars = Object.fromEntries(
            layout.particulars
              .filter((f) => f.required)
              .map((f) => [
                f.key,
                f.type === 'number' ? 0 : 'DEMO - not applicable',
              ]),
          );
          Object.assign(input.particulars, {
            establishmentName: summary.client.clientName,
            establishmentAddress: b.branch.address,
            location: b.branch.branchName,
            business: 'Fictional office services',
            regularWorkers: 3,
            categoryPermanentMale: 3,
            categoryTotalMale: 3,
            classUnskilledMale: 3,
            classTotalMale: 3,
            registrations: 'DEMO - no registration asserted',
            wageOrder:
              'DEMO calculation only - not a minimum wage determination',
          });
        }
        assert.deepEqual(validateRegister(form.id, input), []);
        const result = await builder.generate(form.id, input, admin);
        const same = await builder.generate(form.id, input, admin);
        assert.equal(same.recordId, result.recordId);
        const file = path.join(
          folder,
          state +
            '-' +
            form.formNumber.replaceAll(' ', '').replaceAll('+', '-') +
            '.xlsx',
        );
        await fs.writeFile(file, result.buffer);
        await fs.writeFile(
          file.replace('.xlsx', '-input.json'),
          JSON.stringify(input, null, 2),
        );
        b.files.push({
          file,
          form: form.formNumber,
          act: actCode,
          recordId: result.recordId,
        });
      }
    }
    await fs.writeFile(
      path.join(out, 'demo-data.json'),
      JSON.stringify(summary, null, 2),
    );
    console.log(
      JSON.stringify(
        { output: out, registers: summary.branches.flatMap((b) => b.files) },
        null,
        2,
      ),
    );
  } finally {
    process.chdir(oldCwd);
    await ds.destroy();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
