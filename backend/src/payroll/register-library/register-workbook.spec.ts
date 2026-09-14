import * as ExcelJS from 'exceljs';
import { REGISTER_FORMS } from './register-catalogue';
import {
  definition,
  RegisterInput,
  registerWorkbook,
  validateRegister,
} from './register-workbook';
import { RegisterBuilderService } from './register-builder.service';
import { BranchEntity } from '../../branches/entities/branch.entity';
import { PayrollRunEntity } from '../entities/payroll-run.entity';
import * as fs from 'fs/promises';
import { legalRegisterType, registerIdentity } from './register-identity';

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest
    .fn()
    .mockResolvedValue(Buffer.from('existing approved evidence')),
}));

const id = (source: string, number: string) =>
  REGISTER_FORMS.find((f) => f.sourceId === source && f.formNumber === number)!
    .id;
function validSlip(): RegisterInput {
  return {
    branchId: '11111111-1111-4111-8111-111111111111',
    year: 2026,
    month: 9,
    employer: 'Example Employer',
    owner: 'Example Owner',
    employerPan: 'ABCDE1234F',
    registrationNumber: 'SAMPLE-LIN',
    issueDate: '2026-09-30',
    rows: [
      {
        name: 'Sample Employee',
        relativeName: 'Sample Parent',
        designation: 'Guard',
        uan: '001234567890',
        bankAccount: '00012345678901234567890',
        wagePeriod: '2026-09-01 to 2026-09-30',
        basicRate: '16000',
        daRate: '0',
        allowanceRate: '2000',
        daysWorked: '30',
        overtime: '0',
        gross: '18000',
        deductions: '2070',
        pf: '1800',
        esi: '120',
        otherDeductions: '150',
        net: '15930',
      },
    ],
  };
}

describe('Act-specific register preparation', () => {
  it('offers only implemented form identities, never same-number substitutes', () => {
    expect(() => definition(id('clra', 'XIX'))).toThrow(/reference-only/);
    expect(() => definition(id('osh', 'V'))).toThrow(/reference-only/);
    expect(definition(id('cw', 'V')).layout.payrollPrefill).toBe(true);
    expect(definition(id('cw', 'IX')).layout.payrollPrefill).toBe(false);
    expect(definition(id('cw', 'I')).layout.payrollPrefill).toBe(false);
  });
  it('preserves OSH-specific numbering while using the same data purposes', () => {
    const employee = definition(id('osh', 'XIII')).layout;
    expect(employee.baseFormNumber).toBe('I');
    expect(employee.fields.find((f) => f.key === 'employee_17')!.label).toMatch(
      /^14\./,
    );
    expect(employee.fields.find((f) => f.key === 'employee_15')!.label).toMatch(
      /^21\./,
    );
    expect(
      definition(id('osh', 'XV')).layout.fields.find(
        (f) => f.key === 'paymentDate',
      )!.label,
    ).toMatch(/^29\./);
    expect(
      definition(id('osh', 'XIV')).layout.fields.some(
        (f) => f.key === 'day1Signature',
      ),
    ).toBe(false);
    expect(validateRegister(id('osh', 'XVI'), validSlip())).toEqual([]);
  });
  it('retains differences in AP and Central printed column numbering', () => {
    const ap = definition(id('apw', 'IV')).layout.fields;
    const central = definition(id('cw', 'IV')).layout.fields;
    expect(ap.find((f) => f.key === 'paymentDate')!.label).toMatch(/^29\./);
    expect(central.find((f) => f.key === 'paymentDate')!.label).toMatch(
      /^28\./,
    );
    expect(ap.findIndex((f) => f.key === 'otherDeductions')).toBeLessThan(
      ap.findIndex((f) => f.key === 'deductions'),
    );
    expect(
      central.findIndex((f) => f.key === 'otherDeductions'),
    ).toBeGreaterThan(central.findIndex((f) => f.key === 'deductions'));
  });
  it('validates component totals without silently filling missing amounts', () => {
    const input = validSlip();
    expect(validateRegister(id('apw', 'V'), input)).toEqual([]);
    input.rows[0].net = '15931';
    expect(validateRegister(id('apw', 'V'), input)).toContain(
      'Record 1: gross does not match its component total',
    );
    delete input.rows[0].pf;
    expect(validateRegister(id('apw', 'V'), input).join(' ')).toContain(
      'PF is required',
    );
  });
  it('rejects cross-form fields, numeric identifiers and empty NIL registers', () => {
    const input = validSlip();
    input.rows[0].bankAccount = 123;
    input.rows[0].accidentDate = '2026-09-01';
    expect(validateRegister(id('apw', 'V'), input).join(' ')).toMatch(
      /another form/,
    );
    expect(validateRegister(id('apw', 'V'), input).join(' ')).toMatch(
      /must be text/,
    );
    input.rows = [];
    expect(validateRegister(id('apw', 'V'), input).join(' ')).toMatch(/NIL/);
  });
  it('rejects whitespace required values and impossible dates', () => {
    const input = validSlip();
    input.rows[0].name = '   ';
    input.issueDate = '2026-02-30';
    const errors = validateRegister(id('apw', 'V'), input).join(' ');
    expect(errors).toMatch(/Name of employee is required/);
    expect(errors).toMatch(/Issue date/);
  });
  it('rejects a wage period different from the selected month', () => {
    const input = validSlip();
    input.rows[0].wagePeriod = '2026-08-01 to 2026-08-31';
    expect(validateRegister(id('apw', 'V'), input).join(' ')).toMatch(
      /wage period must match/,
    );
  });
  it('keeps Act identities recoverable from saved record types', () => {
    expect(registerIdentity(legalRegisterType(id('apw', 'V')))).toMatchObject({
      actCode: 'WAGES_2019',
      jurisdiction: 'AP',
      formNumber: 'V',
    });
    expect(legalRegisterType(id('cw', 'V'))).not.toBe(
      legalRegisterType(id('apw', 'V')),
    );
    expect(registerIdentity('WAGE_REGISTER')).toBeNull();
  });
  it('does not reconstruct daily attendance from totals', () => {
    const input = validSlip();
    input.rows = [
      {
        serial: 1,
        employeeCode: 'E1',
        name: 'Employee',
        designation: 'Guard',
        shift: 'General',
        department: 'Gate',
        daysWorked: 30,
        otHours: 0,
      },
    ];
    const errors = validateRegister(id('apw', 'IX'), input);
    expect(errors.join(' ')).toMatch(/day 1 needs attendance/);
    input.rows[0].day31In = '09:00';
    expect(validateRegister(id('apw', 'IX'), input).join(' ')).toMatch(
      /day 31 does not exist/,
    );
  });
  it('renders text identifiers intact and keeps formulas inert with full legal provenance', async () => {
    const input = validSlip();
    input.rows[0].name = '=HYPERLINK("https://example.invalid")';
    const buffer = await registerWorkbook(id('apw', 'V'), input, {
      establishment: 'Sample Branch',
    });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer as any);
    const cells: string[] = [];
    book
      .getWorksheet('Form V')!
      .eachRow((r) => r.eachCell((c) => cells.push(c.text)));
    expect(cells).toContain('00012345678901234567890');
    expect(cells).toContain(input.rows[0].name);
    expect(book.getWorksheet('Form V')!.getCell('B7').type).not.toBe(
      ExcelJS.ValueType.Formula,
    );
    const provenance: string[] = [];
    book
      .getWorksheet('Identity and review')!
      .eachRow((r) => provenance.push(r.getCell(2).text));
    expect(provenance).toContain(id('apw', 'V'));
    expect(provenance).toContain('Rule 43');
    expect(book.getWorksheet('Form V')!.pageSetup.fitToHeight).toBe(0);
  });
});

describe('Register preparation branch and Act eligibility', () => {
  const branchId = '11111111-1111-4111-8111-111111111111';
  let run: any,
    branch: any,
    decision: any,
    ds: any,
    access: any,
    builder: RegisterBuilderService,
    employeeRepo: any;
  beforeEach(() => {
    branch = {
      id: branchId,
      clientId: 'CLIENT1',
      stateCode: 'AP',
      branchName: 'Sample',
      address: 'Sample address',
    };
    run = {
      id: 'RUN1',
      clientId: 'CLIENT1',
      branchId,
      periodYear: 2026,
      periodMonth: 9,
      status: 'APPROVED',
      approvedAt: new Date(),
    };
    decision = {
      applicable: true,
      government: 'STATE',
      factState: 'AP',
      computedAt: '2026-09-02',
      factsUpdatedAt: '2026-09-01',
    };
    employeeRepo = {
      find: jest.fn().mockResolvedValue([
        {
          employeeCode: 'E1',
          employeeName: 'Sample',
          daysPresent: 30,
          otHours: 0,
          grossEarnings: '18000',
          totalDeductions: '2070',
          netPay: '15930',
        },
      ]),
    };
    ds = {
      getRepository: jest.fn((entity: any) =>
        entity === BranchEntity
          ? { findOneBy: async () => branch }
          : entity === PayrollRunEntity
            ? { findOneBy: async () => run }
            : employeeRepo,
      ),
      query: jest.fn(async () => [decision]),
    };
    access = {
      assertBranchAllowed: jest.fn(),
      assertClientAllowed: jest.fn(),
      assertCcoBranchAllowed: jest.fn(),
    };
    builder = new RegisterBuilderService(ds, access);
  });
  it('requires confirmed Act applicability and the appropriate government', async () => {
    decision.applicable = false;
    await expect(
      builder.context(id('apw', 'V'), branchId, 2026, 9, {} as any),
    ).rejects.toThrow(/applicability/);
    decision.applicable = true;
    decision.government = 'CENTRAL';
    await expect(
      builder.context(id('apw', 'V'), branchId, 2026, 9, {} as any),
    ).rejects.toThrow(/appropriate government/);
  });
  it('checks the selected OSH Act rather than borrowing wage applicability', async () => {
    decision.government = 'CENTRAL';
    await builder.context(id('osh', 'XVI'), branchId, 2026, 9, {} as any);
    expect(ds.query).toHaveBeenCalledWith(
      expect.stringContaining('cm.code=$2'),
      [branchId, 'OSH_2020'],
    );
  });
  it('rejects state mismatches, partial effective months and stale facts', async () => {
    branch.stateCode = 'TS';
    await expect(
      builder.context(id('apw', 'V'), branchId, 2026, 9, {} as any),
    ).rejects.toThrow(/different state/);
    branch.stateCode = 'AP';
    await expect(
      builder.context(id('apw', 'V'), branchId, 2026, 6, {} as any),
    ).rejects.toThrow(/full selected month/);
    decision.factsUpdatedAt = '2026-09-03';
    await expect(
      builder.context(id('apw', 'V'), branchId, 2026, 9, {} as any),
    ).rejects.toThrow(/facts changed/);
  });
  it('rejects another client, branch, period and unapproved payroll before reading employees', async () => {
    for (const change of [
      { clientId: 'OTHER' },
      { branchId: 'OTHER' },
      { periodMonth: 8 },
      { status: 'DRAFT' },
    ]) {
      const original = { ...run };
      Object.assign(run, change);
      await expect(
        builder.prefill(id('apw', 'V'), branchId, 'RUN1', 2026, 9, {} as any),
      ).rejects.toThrow();
      run = original;
    }
    expect(employeeRepo.find).not.toHaveBeenCalled();
  });
  it('filters company-wide payroll to the requested branch and invokes scope checks', async () => {
    run.branchId = null;
    const result = await builder.prefill(
      id('apw', 'V'),
      branchId,
      'RUN1',
      2026,
      9,
      {} as any,
    );
    expect(result.rows).toHaveLength(1);
    expect(employeeRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { runId: 'RUN1', clientId: 'CLIENT1', branchId },
      }),
    );
    expect(access.assertBranchAllowed).toHaveBeenCalled();
    expect(access.assertCcoBranchAllowed).toHaveBeenCalled();
    expect(result.rows[0].basicRate).toBeUndefined();
  });
  it('routes master and muster forms to operational records, not payroll totals', async () => {
    ds.query.mockResolvedValueOnce([decision]).mockResolvedValueOnce([]);
    await expect(
      builder.prefill(id('apw', 'I'), branchId, 'RUN1', 2026, 9, {} as any),
    ).rejects.toThrow(/approved employee records/);
    ds.query.mockResolvedValueOnce([decision]).mockResolvedValueOnce([]);
    await expect(
      builder.prefill(id('apw', 'IX'), branchId, 'RUN1', 2026, 9, {} as any),
    ).rejects.toThrow(/approved daily attendance/);
    expect(employeeRepo.find).not.toHaveBeenCalled();
  });
  it('saves new content for approval and reuses identical approved evidence without overwriting it', async () => {
    const records: any[] = [];
    const repo = {
      findOneBy: jest.fn(async (q) =>
        records.find((r) => r.fileName === q.fileName),
      ),
      create: jest.fn((r) => r),
      save: jest.fn(async (r) => {
        const saved = { ...r, id: 'record-' + records.length };
        records.push(saved);
        return saved;
      }),
    };
    const manager = { query: jest.fn(), getRepository: () => repo };
    ds.transaction = async (fn: any) => fn(manager);
    jest.mocked(fs.writeFile).mockClear();
    const first = await builder.generate(id('apw', 'V'), validSlip(), {
      id: 'preparer',
    } as any);
    expect(records[0]).toMatchObject({
      approvalStatus: 'PENDING',
      branchId,
      registerType: legalRegisterType(id('apw', 'V')),
    });
    records[0].approvalStatus = 'APPROVED';
    const sameNumbers = validSlip();
    sameNumbers.rows[0].gross = 18000;
    const second = await builder.generate(id('apw', 'V'), sameNumbers, {
      id: 'preparer',
    } as any);
    expect(second.recordId).toBe(first.recordId);
    expect(second.buffer.toString()).toBe('existing approved evidence');
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    const revised = validSlip();
    revised.rows[0].designation = 'Supervisor';
    await builder.generate(id('apw', 'V'), revised, { id: 'preparer' } as any);
    expect(records).toHaveLength(2);
    expect(records[0].approvalStatus).toBe('APPROVED');
    expect(records[1].approvalStatus).toBe('PENDING');
    expect(records[1].filePath).not.toBe(records[0].filePath);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      expect.any(Array),
    );
  });
});

describe('Purpose-specific register validation', () => {
  it('requires accident evidence and consistent incident dates', () => {
    const data = validSlip();
    data.rows = [
      { eventDate: '2026-09-10', eventNature: 'Sample dangerous occurrence' },
    ];
    const form = id('osh', 'XIX');
    expect(validateRegister(form, data).join(' ')).toMatch(
      /evidence reference/,
    );
    data.supportingReference = 'Fictional incident report 1';
    expect(validateRegister(form, data)).toEqual([]);
    data.rows[0].returnDate = '2026-09-09';
    expect(validateRegister(form, data).join(' ')).toMatch(/cannot precede/);
    data.rows[0].eventDate = '2026-08-10';
    expect(validateRegister(form, data).join(' ')).toMatch(/selected month/);
  });
  it('keeps worker-register serial distinct from the employee identifier in leave forms', () => {
    const data = validSlip();
    const form = id('osh', 'XX');
    const row: any = {};
    for (const f of definition(form).layout.fields) {
      if (f.required)
        row[f.key] =
          f.type === 'date'
            ? '2026-09-01'
            : f.type === 'number' || f.type === 'money'
              ? 0
              : 'Sample';
    }
    row.part = 'ADULT';
    row.serial = 1;
    data.rows = [row];
    expect(validateRegister(form, data)).toEqual([]);
    delete row.workerRegisterSerial;
    expect(validateRegister(form, data).join(' ')).toMatch(/workers register/);
    row.part = 'UNKNOWN';
    expect(validateRegister(form, data).join(' ')).toMatch(
      /ADULT or ADOLESCENT/,
    );
  });
});

describe('Bihar, Ladakh and Uttar Pradesh prescribed schedules', () => {
  it('distinguishes the Uttar Pradesh wage slip from same-number muster rolls', () => {
    expect(definition(id('upw', 'IX')).layout.baseFormNumber).toBe('V');
    for (const source of ['brw', 'ldw']) {
      expect(definition(id(source, 'IX')).layout.baseFormNumber).toBe('IX');
      expect(
        definition(id(source, 'IX')).layout.fields.some(
          (f) => f.key === 'day31Signature',
        ),
      ).toBe(true);
    }
    expect(validateRegister(id('upw', 'IX'), validSlip())).toEqual([]);
  });
  it('preserves the Uttar Pradesh employee continuation and wage column numbering', () => {
    const fields = definition(id('upw', 'II')).layout.fields;
    expect(fields).toHaveLength(37);
    expect(fields.find((f) => f.key === 'employee_7')!.label).toMatch(/^31\./);
    expect(fields.find((f) => f.key === 'employee_22')!.label).toMatch(/^37\./);
    const wages = definition(id('upw', 'I')).layout.fields;
    expect(wages).toHaveLength(33);
    expect(wages[0].key).toBe('employeeCode');
    expect(wages.find((f) => f.key === 'paymentDate')!.label).toMatch(/^28\./);
  });
  it.each(['brw', 'ldw'])(
    'validates %s deductions without an invented Advances column',
    (source) => {
      const fields = definition(id(source, 'IV')).layout.fields;
      expect(fields).toHaveLength(33);
      expect(fields.some((f) => f.key === 'advances')).toBe(false);
      expect(fields.find((f) => f.key === 'otherDeductions')!.label).toMatch(
        /^23\./,
      );
      const input = validSlip();
      input.rows = [
        Object.fromEntries(
          fields.map((f) => [
            f.key,
            f.type === 'money' || f.type === 'number'
              ? 0
              : f.type === 'date'
                ? '2026-09-30'
                : 'Sample',
          ]),
        ),
      ];
      Object.assign(input.rows[0], {
        serial: 1,
        frequency: 'Monthly',
        wagePeriod: '2026-09-01 to 2026-09-30',
        basic: 18000,
        gross: 18000,
        pf: 1800,
        esi: 120,
        otherDeductions: 150,
        deductions: 2070,
        net: 15930,
      });
      expect(validateRegister(id(source, 'IV'), input)).toEqual([]);
      input.rows[0].otherDeductions = 149;
      expect(validateRegister(id(source, 'IV'), input).join(' ')).toMatch(
        /deductions does not match/,
      );
    },
  );
  it('uses publication commencement rather than earlier notification dates', () => {
    expect(definition(id('brw', 'I')).form.effectiveFrom).toBe('2026-07-01');
    expect(definition(id('ldw', 'I')).form.effectiveFrom).toBe('2026-08-03');
    expect(definition(id('upw', 'II')).form.effectiveFrom).toBe('2026-08-12');
  });
});

describe('Sikkim and Arunachal Pradesh source-specific implementation', () => {
  it('uses the complete alternate Arunachal notification for all three schedules', () => {
    expect(definition(id('arw', 'I')).layout.fields).toHaveLength(19);
    expect(validateRegister(id('arw', 'V'), validSlip())).toEqual([]);
    expect(definition(id('arw', 'IV')).layout.fields).toHaveLength(30);
  });
  it('preserves Sikkim wage columns without inventing PF or gross wage columns', () => {
    const fields = definition(id('skw', 'I')).layout.fields;
    expect(fields).toHaveLength(19);
    expect(fields.some((f) => f.key === 'gross' || f.key === 'pf')).toBe(false);
    expect(fields[18].label).toBe('19. Attendance signature');
    expect(definition(id('skw', 'IV')).layout.fields).toHaveLength(30);
    expect(validateRegister(id('skw', 'V'), validSlip())).toEqual([]);
  });
});

describe('Social Security women employees register', () => {
  const sample = (): RegisterInput => ({
    ...validSlip(),
    supportingReference: 'HR register and bank evidence',
    rows: [
      {
        establishmentName: 'Example branch',
        name: 'Example woman; Parent name',
        appointmentDate: '2026-01-01',
        natureOfWork: 'Accounts',
        employmentMonth: '2026-09',
        employedDays: 30,
        laidOffDays: 0,
        notEmployedDays: 0,
        employmentRemarks: 'Employed throughout month',
      },
    ],
  });
  it('allows women employees without inventing a maternity event', () => {
    expect(definition(id('ss', 'XXII')).layout.baseFormNumber).toBe(
      'MATERNITY',
    );
    expect(validateRegister(id('ss', 'XXII'), sample())).toEqual([]);
  });
  it('requires evidence, consistent month totals and paired payment details', () => {
    const input = sample();
    input.supportingReference = '';
    Object.assign(input.rows[0], { employedDays: 31, advanceAmount: 1000 });
    const errors = validateRegister(id('ss', 'XXII'), input).join(' ');
    expect(errors).toMatch(/evidence reference/);
    expect(errors).toMatch(/without overlap/);
    expect(errors).toMatch(/advance payment date/);
  });
  it('rejects employment totals outside appointment and discharge dates', () => {
    const input = sample();
    input.rows[0].dischargeDate = '2026-09-10';
    expect(validateRegister(id('ss', 'XXII'), input).join(' ')).toMatch(
      /appointment\/discharge period/,
    );
  });
  it('reserves inspector remarks and requires the illness leave period', () => {
    const input = sample();
    Object.assign(input.rows[0], {
      inspectorRemarks: 'Approved',
      section65IllnessAmount: 1000,
      section65IllnessDate: '2026-09-10',
    });
    const errors = validateRegister(id('ss', 'XXII'), input).join(' ');
    expect(errors).toMatch(/left blank/);
    expect(errors).toMatch(/leave period is required/);
  });
});
