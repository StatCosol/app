import * as ExcelJS from 'exceljs';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PayrollProcessingService } from './payroll-processing.service';

/**
 * Characterisation tests for the attendance importer.
 *
 * This path had no tests at all, and it decides LOP — which decides pay. It is
 * also the second of two column parsers in this file, each with its own
 * convention for the header map; F10 was that arithmetic going wrong in the
 * other one. These pin the current behaviour so the two can be brought onto a
 * shared reader without guessing at what they did before.
 */
describe('payroll attendance upload — column handling', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'payroll-att-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function writeSheet(
    header: string[],
    rows: Array<Array<string | number>>,
  ): Promise<string> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Attendance');
    ws.addRow(header);
    for (const r of rows) ws.addRow(r);
    const path = join(dir, `att-${Date.now()}-${Math.random()}.xlsx`);
    await wb.xlsx.writeFile(path);
    return path;
  }

  function makeService(category = 'REGULAR', wageBasisDays = 'FIXED_26') {
    const saved: any[] = [];
    const upserts: Array<{ code: string; amount: number }> = [];

    const runEmp = {
      id: 're-1',
      employeeCode: 'E001',
      employeeName: 'Example',
      branchId: 'b1',
    };

    // Bound by name rather than constructor position — see the note in
    // payroll-breakup-columns.spec.ts.
    const svc = new (PayrollProcessingService as any)();
    svc.runRepo = {
      findOne: async () => ({
        id: 'run-1',
        clientId: 'c1',
        branchId: 'b1',
        periodMonth: 4,
        periodYear: 2026,
        status: 'DRAFT',
        payrollCategory: category,
      }),
    };
    svc.runEmpRepo = {
      find: async () => [runEmp],
      create: (v: any) => v,
      save: async (v: any) => {
        saved.push({ ...v });
        return v;
      },
    };
    // Attendance writes component values straight through the query builder.
    svc.compValRepo = {
      createQueryBuilder: () => ({
        insert: () => ({
          values: (v: any) => {
            upserts.push({ code: v.componentCode, amount: Number(v.amount) });
            return { orUpdate: () => ({ execute: async () => undefined }) };
          },
        }),
      }),
    };
    svc.empRepo = { find: async () => [] };
    svc.ds = {
      getRepository: () => ({ findOne: async () => ({ wageBasisDays }) }),
    };
    return { svc, saved, upserts, runEmp };
  }

  const valueOf = (
    upserts: Array<{ code: string; amount: number }>,
    code: string,
  ) => upserts.find((u) => u.code === code)?.amount;

  it('reads each column under its own header', async () => {
    const path = await writeSheet(
      ['Employee Code', 'Working Days', 'Payable Days', 'OT Hours'],
      [['E001', 26, 24, 10]],
    );
    const { svc, upserts } = makeService();

    const res = await svc.uploadAttendance('run-1', { path } as any);

    expect(res.matched).toBe(1);
    expect(valueOf(upserts, 'WORKED_DAYS')).toBe(26);
    expect(valueOf(upserts, 'PAYABLE_DAYS')).toBe(24);
    expect(valueOf(upserts, 'OT_HOURS')).toBe(10);
  });

  it.each([26, 25.5, 23.5, 0])(
    'accepts the attendance template with %s days and blank optional cells',
    async (days) => {
      const path = await writeSheet(
        [
          'Employee Code',
          'Employee Name',
          'Working Days',
          'Payable Days',
          'Approved Leave Days',
          'PL Days',
          'SL Days',
          'OT Hours',
          'Other Earnings',
          'Arrears Attendance Bonus',
          'Other Deductions',
        ],
        [['E001', 'Example', days, days, '', '', '', '', '', '', '']],
      );
      const { svc, upserts } = makeService();
      const result = await svc.uploadAttendance('run-1', { path } as any);
      expect(result.matched).toBe(1);
      expect(result.unrecognisedHeaders).toEqual([]);
      expect(valueOf(upserts, 'WORKED_DAYS')).toBe(days);
      expect(valueOf(upserts, 'PAYABLE_DAYS')).toBe(days);
      expect(valueOf(upserts, 'EL_PAID_LEAVE_DAYS')).toBe(0);
    },
  );

  it('derives LOP from the highest payable days in the sheet', async () => {
    const path = await writeSheet(
      ['Employee Code', 'Working Days', 'Payable Days'],
      [['E001', 26, 24]],
    );
    const { svc, upserts } = makeService();

    await svc.uploadAttendance('run-1', { path } as any);

    // One row, so it is its own maximum and nothing is lost.
    expect(valueOf(upserts, 'LOP_DAYS')).toBe(0);
  });

  it.each([
    ['FIXED_26', 26],
    ['CALENDAR_DAYS', 30],
  ])(
    'uses the configured %s divisor for a partial intern attendance upload',
    async (basis, expected) => {
      const path = await writeSheet(
        ['Employee Code', 'Working Days', 'Payable Days'],
        [['E001', 13, 13]],
      );
      const { svc, saved } = makeService('INTERN', String(basis));
      await svc.uploadAttendance('run-1', { path } as any);
      expect(saved[0]).toMatchObject({
        totalDays: expected,
        daysPresent: 13,
        lopDays: Number(expected) - 13,
      });
    },
  );

  it('rejects invalid intern attendance before saving any input values', async () => {
    const path = await writeSheet(
      ['Employee Code', 'Working Days', 'Payable Days'],
      [['E001', -1, -1]],
    );
    const { svc, saved, upserts } = makeService('INTERN');
    await expect(
      svc.uploadAttendance('run-1', { path } as any),
    ).rejects.toThrow('Intern attendance days');
    expect(saved).toEqual([]);
    expect(upserts).toEqual([]);
  });

  it('imports formatted Excel headers after a title and blank row', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Attendance');
    ws.addRow(['Employee Code and Working Days Report']);
    ws.addRow([]);
    ws.addRow([
      { richText: [{ text: 'Employee ' }, { text: 'Code' }] },
      { richText: [{ text: 'Working ' }, { text: 'Days' }] },
      'Payable Days',
    ]);
    ws.addRow(['E001', 25.5, 25.5]);
    const path = join(dir, 'formatted-headers.xlsx');
    await wb.xlsx.writeFile(path);
    const { svc, upserts } = makeService();
    expect((await svc.uploadAttendance('run-1', { path } as any)).matched).toBe(
      1,
    );
    expect(valueOf(upserts, 'WORKED_DAYS')).toBe(25.5);
  });

  it('ignores invisible characters in header labels', async () => {
    const path = await writeSheet(
      ['Employee\u200B Code', 'Working\u200B Days'],
      [['E001', 26]],
    );
    const { svc } = makeService();
    expect((await svc.uploadAttendance('run-1', { path } as any)).matched).toBe(
      1,
    );
  });

  it('still rejects a sheet without an employee code header', async () => {
    const path = await writeSheet(['Name', 'Working Days'], [['Example', 26]]);
    const { svc } = makeService();
    await expect(
      svc.uploadAttendance('run-1', { path } as any),
    ).rejects.toThrow(
      'Column "Employee Code" / "Employee ID" not found in header',
    );
  });

  it('keeps PL and SL out of the approved-leave column', async () => {
    // The matcher is deliberately ordered so PL/SL are claimed before the
    // generic approved-leave pattern can absorb them.
    const path = await writeSheet(
      ['Employee Code', 'Working Days', 'Payable Days', 'PL Days', 'SL Days'],
      [['E001', 26, 26, 2, 1]],
    );
    const { svc, upserts } = makeService();

    await svc.uploadAttendance('run-1', { path } as any);

    expect(valueOf(upserts, 'PL_DAYS')).toBe(2);
    expect(valueOf(upserts, 'SL_DAYS')).toBe(1);
    expect(valueOf(upserts, 'EL_PAID_LEAVE_DAYS')).toBe(0);
  });

  it('recognises an explicit approved-leave column', async () => {
    const path = await writeSheet(
      ['Employee Code', 'Working Days', 'Payable Days', 'Approved Leaves'],
      [['E001', 26, 26, 3]],
    );
    const { svc, upserts } = makeService();

    await svc.uploadAttendance('run-1', { path } as any);

    expect(valueOf(upserts, 'EL_PAID_LEAVE_DAYS')).toBe(3);
  });

  it('reports an employee code that is not in the run', async () => {
    const path = await writeSheet(
      ['Employee Code', 'Working Days', 'Payable Days'],
      [['E999', 26, 26]],
    );
    const { svc } = makeService();

    const res = await svc.uploadAttendance('run-1', { path } as any);

    expect(res.matched).toBe(0);
    expect(res.skipped).toContain('E999');
  });

  it('carries other earnings and deductions from their own columns', async () => {
    const path = await writeSheet(
      [
        'Employee Code',
        'Working Days',
        'Payable Days',
        'Other Earnings',
        'Other Deductions',
      ],
      [['E001', 26, 26, 1500, 250]],
    );
    const { svc, upserts } = makeService();

    await svc.uploadAttendance('run-1', { path } as any);

    expect(valueOf(upserts, 'OTHER_EARNINGS')).toBe(1500);
    expect(valueOf(upserts, 'OTHER_DEDUCTIONS')).toBe(250);
  });
});
