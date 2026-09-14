import { BadRequestException } from '@nestjs/common';
import { ContractorComputationService } from './contractor-computation.service';

const branchUser = {
  id: 'reviewer',
  clientId: 'client',
  roleCode: 'BRANCH_DESK',
  branchIds: ['branch'],
} as any;
const vendor = {
  id: 'vendor',
  clientId: 'client',
  roleCode: 'CONTRACTOR',
} as any;

function setup(opts: { rows?: any[]; lots?: any[]; period?: string } = {}) {
  const batch = {
    id: 'batch',
    client_id: 'client',
    branch_id: 'branch',
    contractor_user_id: 'vendor',
    period_month: opts.period ?? '2026-09',
    is_current: true,
    status: 'PENDING',
    rows_snapshot: opts.rows ?? [{ employee_code: 'G001', days_worked: 26 }],
  };
  const service: any = new (ContractorComputationService as any)(
    ...new Array(13).fill({}),
  );
  const query = jest.fn(
    async (sql: string, _params?: any[]): Promise<any[]> => {
      if (sql.startsWith('SELECT * FROM contractor_attendance')) return [batch];
      if (sql.startsWith('INSERT INTO contractor_attendance'))
        return [{ id: 'batch', status: 'PENDING' }];
      if (sql.includes('AS "earnedPeriodMonth"')) return opts.lots ?? [];
      return [];
    },
  );
  const manager: any = { query };
  manager.transaction = (fn: any) => fn(manager);
  service.computationRepo = { manager };
  service.scope = {
    assertBranchAllowed: jest.fn(),
    assertClientAllowed: jest.fn(),
    resolveClientId: () => 'client',
  };
  service.assertContractorLinked = jest.fn();
  service.findEmployee = jest
    .fn()
    .mockResolvedValue({ employeeCode: 'G001', name: 'Sample guard' });
  service.computeOne = jest
    .fn()
    .mockResolvedValue({ netSalary: 18000, matchStatus: 'MATCHED' });
  service.workflow = {
    lock: jest.fn(),
    saveDraft: jest.fn(
      async (_u: any, _k: any, calculate: any, before: any) => {
        await before(manager);
        return { saved: await calculate(), version: { id: 'payroll' } };
      },
    ),
  };
  service.reconciliation = {
    checkPeriod: jest.fn().mockResolvedValue(undefined),
  };
  const sqlCalls = (prefix: string): any[][] =>
    query.mock.calls.filter(([sql]) => String(sql).trim().startsWith(prefix));
  return { service, query, sqlCalls };
}

describe('contractor Sunday work submission', () => {
  it('reads Sunday days from dated attendance and drops any contractor C-off choice', async () => {
    const { service, sqlCalls } = setup();
    await service.computeMcdRows(vendor, {
      branchId: 'branch',
      periodMonth: '2026-11',
      rows: [
        {
          employee_code: 'G001',
          days_worked: 2,
          sunday_coff_days: 1,
          daily_attendance: [
            { date: '2026-11-01', days: 1, hours: 0 }, // Sunday
            { date: '2026-11-02', days: 1, hours: 0 },
          ],
        },
      ],
    });
    const [stored] = JSON.parse(
      sqlCalls('INSERT INTO contractor_attendance')[0][1][4],
    );
    expect(stored.sunday_days_worked).toBe(1);
    expect(stored.sunday_coff_days).toBeUndefined();
  });

  it('rejects more Sunday days than the month has Sundays', async () => {
    const { service } = setup();
    await expect(
      service.computeMcdRows(vendor, {
        branchId: 'branch',
        periodMonth: '2026-09', // 4 Sundays
        rows: [
          { employee_code: 'G001', days_worked: 26, sunday_days_worked: 5 },
        ],
      }),
    ).rejects.toThrow('Sunday days worked');
  });

  it('rejects C-off days that push paid days past the month', async () => {
    const { service } = setup();
    await expect(
      service.computeMcdRows(vendor, {
        branchId: 'branch',
        periodMonth: '2026-09',
        rows: [
          { employee_code: 'G001', days_worked: 29, coff_days_availed: 2 },
        ],
      }),
    ).rejects.toThrow('C-off days taken');
  });
});

describe('branch approval of Sunday work and C-off', () => {
  it('rejects more Sundays as C-off than Sundays worked', async () => {
    const { service } = setup();
    await expect(
      service.reviewAttendance(
        branchUser,
        'batch',
        'approve',
        'Checked Sundays',
        [
          {
            employee_code: 'G001',
            days_worked: 26,
            sunday_days_worked: 1,
            sunday_coff_days: 2,
          },
        ],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.computeOne).not.toHaveBeenCalled();
  });

  it('earns a C-off lot valid for 90 days from the last Sunday of the month', async () => {
    const { service, sqlCalls } = setup();
    await service.reviewAttendance(
      branchUser,
      'batch',
      'approve',
      'Checked Sundays',
      [
        {
          employee_code: 'G001',
          days_worked: 26,
          sunday_days_worked: 2,
          sunday_coff_days: 1,
        },
      ],
    );
    const [insert] = sqlCalls('INSERT INTO contractor_comp_off_lots');
    // client, branch, contractor, code, period, earned_on, expires_on, days
    expect(insert[1].slice(0, 8)).toEqual([
      'client',
      'branch',
      'vendor',
      'G001',
      '2026-09',
      '2026-09-27',
      '2026-12-26',
      1,
    ]);
    expect(service.computeOne.mock.calls[0][6]).toMatchObject({
      sunday_days_worked: 2,
      sunday_coff_days: 1,
    });
    expect(
      service.computeOne.mock.calls[0][6].coff_converted_days,
    ).toBeUndefined();
  });

  it('pays unused C-off that expires this month as double wages', async () => {
    const { service, sqlCalls } = setup({
      lots: [
        {
          id: 'lot-june',
          earnedPeriodMonth: '2026-06',
          expiresOn: '2026-09-25',
          balance: 1,
        },
      ],
    });
    await service.reviewAttendance(
      branchUser,
      'batch',
      'approve',
      'Checked attendance',
    );
    const usage = sqlCalls('INSERT INTO contractor_comp_off_usages')[0];
    expect(usage[1]).toEqual(['lot-june', '2026-09', 'CONVERTED', 1, 'batch']);
    expect(service.computeOne.mock.calls[0][6]).toMatchObject({
      coff_converted_days: 1,
    });
  });

  it('records C-off taken against the available balance', async () => {
    const { service, sqlCalls } = setup({
      lots: [
        {
          id: 'lot-aug',
          earnedPeriodMonth: '2026-08',
          expiresOn: '2026-11-28',
          balance: 2,
        },
      ],
    });
    await service.reviewAttendance(
      branchUser,
      'batch',
      'approve',
      'Checked attendance',
      [{ employee_code: 'G001', days_worked: 25, coff_days_availed: 1 }],
    );
    expect(sqlCalls('INSERT INTO contractor_comp_off_usages')[0][1]).toEqual([
      'lot-aug',
      '2026-09',
      'AVAILED',
      1,
      'batch',
    ]);
  });

  it('refuses C-off taken beyond the available balance', async () => {
    const { service } = setup();
    await expect(
      service.reviewAttendance(
        branchUser,
        'batch',
        'approve',
        'Checked attendance',
        [{ employee_code: 'G001', days_worked: 25, coff_days_availed: 1 }],
      ),
    ).rejects.toThrow('exceed the available C-off balance');
    expect(service.computeOne).not.toHaveBeenCalled();
  });
});

describe('Sunday pay in the payroll calculation', () => {
  function calculator(quote: any) {
    const service: any = new (ContractorComputationService as any)(
      ...new Array(13).fill({}),
    );
    service.findEmployee = async () => ({
      employeeCode: 'G001',
      name: 'Sample guard',
      skillCategory: 'SKILLED',
      designation: 'GUARD',
      pfApplicable: true,
      esiApplicable: false,
      dateOfJoining: '2026-01-01',
    });
    service.branchRepo = {
      findOne: async () => ({ id: 'branch', stateCode: 'TS' }),
    };
    service.findQuotation = async () => quote;
    service.findPayrollSetup = async () => ({
      pfEnabled: true,
      pfWageCeiling: 15000,
      pfEmployeeRate: 12,
      pfEmployerRate: 12,
      esiEnabled: false,
      ptEnabled: false,
      lwfEnabled: false,
    });
    service.findMinimumDailyWage = async () => 400;
    service.resolveSlabAmount = async () => 0;
    const qb: any = {};
    for (const m of ['where', 'andWhere', 'orderBy', 'addOrderBy'])
      qb[m] = () => qb;
    qb.getMany = async () => [quote];
    service.quotationRepo = { createQueryBuilder: () => qb };
    service.computationRepo = { create: (row: any) => row };
    return service;
  }

  it('adds one extra day for each Sunday worked that is not a C-off (daily wage quotation)', async () => {
    const service = calculator({
      id: 'q',
      dailyWage: 650,
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
      rateCard: null,
    });
    const row = await service.computeOne(
      'client',
      'vendor',
      'branch',
      '2026-11',
      null,
      1,
      {
        employee_code: 'G001',
        days_worked: 26,
        sunday_days_worked: 3,
        sunday_coff_days: 1,
      },
    );
    expect(row.basicWage).toBe(16900); // 650 × 26
    expect(row.grossWage).toBe(18200); // + 2 extra Sunday days × 650
    expect(row.pfDeduction).toBe(1800); // PF stays on basic (capped at 15000)
    expect(row.calculationSnapshot.sundayWork).toMatchObject({
      doubleDays: 2,
      amount: 1300,
    });
  });

  it('pays Sunday double wages on the rate card day rate', async () => {
    const service = calculator({
      id: 'q',
      dailyWage: 676,
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
      rateCard: {
        rounding: 'RUPEE',
        components: [
          {
            code: 'BASIC_DA',
            label: 'Basic',
            category: 'EARNING',
            method: 'FIXED',
            value: 16900,
            prorate: true,
          },
          {
            code: 'SITE',
            label: 'Site',
            category: 'EARNING',
            method: 'FIXED',
            value: 2000,
            prorate: true,
          },
          {
            code: 'BONUS',
            label: 'Bonus',
            category: 'EARNING',
            method: 'FIXED',
            value: 1300,
            prorate: true,
          },
        ],
      },
    });
    const row = await service.computeOne(
      'client',
      'vendor',
      'branch',
      '2026-11',
      null,
      1,
      {
        employee_code: 'G001',
        days_worked: 25,
        sunday_days_worked: 2,
      },
    );
    // November 2026: 25 working days. Day rate = (16900 + 2000) / 25 = 756 (bonus excluded).
    expect(row.calculationSnapshot.sundayWork).toMatchObject({
      dayRate: 756,
      doubleDays: 2,
      amount: 1512,
    });
    expect(row.grossWage).toBe(20412); // 20200 earnings − 1300 bonus + 1512
    expect(row.netSalary).toBe(21712);
  });

  it('rejects more Sundays than fall within the employment dates', async () => {
    const service = calculator({
      id: 'q',
      dailyWage: 650,
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
      rateCard: null,
    });
    service.findEmployee = async () => ({
      employeeCode: 'G001',
      name: 'Sample guard',
      skillCategory: 'SKILLED',
      designation: 'GUARD',
      pfApplicable: true,
      esiApplicable: false,
      dateOfJoining: '2026-11-20', // only Sundays 22 and 29 remain
    });
    await expect(
      service.computeOne('client', 'vendor', 'branch', '2026-11', null, 1, {
        employee_code: 'G001',
        days_worked: 9,
        sunday_days_worked: 3,
      }),
    ).rejects.toThrow('Sunday days worked');
  });
});
