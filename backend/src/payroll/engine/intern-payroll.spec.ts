import { PayrollEngineService } from './payroll-engine.service';
import { WageBaseService } from './wage-base.service';
import { StatutoryCalculatorService } from '../services/statutory-calculator.service';
import { PayrollRunEmployeeEntity } from '../entities/payroll-run-employee.entity';

describe('Intern payroll through the payroll engine', () => {
  function fixture(
    days: number | null,
    basis = 'FIXED_26',
    month = 4,
    year = 2026,
  ) {
    const run = {
      id: 'run',
      clientId: 'client',
      payrollCategory: 'INTERN',
      periodYear: year,
      periodMonth: month,
      status: 'DRAFT',
    };
    const emp = {
      id: 'run-emp',
      employeeId: 'emp',
      employeeCode: 'I001',
      totalDays: days === null ? 0 : 26,
      daysPresent: days ?? 0,
      lopDays: days === null ? 0 : 26 - days,
      ncpDays: 0,
      otHours: 0,
    };
    const master = {
      id: 'emp',
      payrollCategory: 'INTERN',
      monthlyGross: 26000,
      pfApplicable: false,
      esiApplicable: false,
    };
    const builder: any = {};
    for (const method of ['delete', 'from', 'where', 'andWhere'])
      builder[method] = jest.fn(() => builder);
    builder.execute = jest.fn().mockResolvedValue({});
    const manager = {
      query: jest.fn().mockResolvedValue([]),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({}),
      create: jest.fn((_entity, data) => data),
      save: jest.fn(async (_entity, data) => data),
      createQueryBuilder: () => builder,
    };
    const qr = {
      manager,
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    };
    const svc = new (PayrollEngineService as any)();
    Object.assign(svc, {
      runRepo: { findOne: jest.fn().mockResolvedValue(run), save: jest.fn() },
      runEmpRepo: { find: jest.fn().mockResolvedValue([emp]) },
      setupRepo: {
        findOne: jest.fn().mockResolvedValue({
          wageBasisDays: basis,
          pfEnabled: false,
          esiEnabled: false,
          ptEnabled: false,
          lwfEnabled: false,
        }),
      },
      compRepo: {
        find: jest
          .fn()
          .mockResolvedValue([{ code: 'BASIC', componentType: 'EARNING' }]),
      },
      compValRepo: {
        find: jest.fn().mockResolvedValue(
          days === null
            ? []
            : [
                { componentCode: 'WORKED_DAYS', amount: days },
                { componentCode: 'PAYABLE_DAYS', amount: days },
              ],
        ),
      },
      empRepo: { findOne: jest.fn().mockResolvedValue(master) },
      ds: { createQueryRunner: () => qr },
      attendanceService: { getMonthlySummary: jest.fn().mockResolvedValue([]) },
      structureResolver: { resolve: jest.fn() },
      leaveBalanceRepo: { findOne: jest.fn().mockResolvedValue(null) },
      leavePolicyRepo: { count: jest.fn().mockResolvedValue(0) },
      wageBase: new WageBaseService(),
      statutory: new StatutoryCalculatorService(),
      tdsCalc: { calculate: jest.fn().mockReturnValue({ monthlyTds: 0 }) },
      resolveMinWage: jest.fn().mockResolvedValue(0),
      resolveClientScheduledEmployment: jest.fn().mockResolvedValue(null),
      persistComponentValues: jest.fn().mockResolvedValue(undefined),
    });
    return { svc, run, emp, master, qr, manager };
  }

  it.each([
    [13, 13000],
    [25.5, 25500],
    [26, 26000],
    [30, 26000],
    [0, 0],
    [null, 0],
  ])(
    'pays %s attendance days as %s, without applying a regular salary structure',
    async (days, expected) => {
      const { svc, emp } = fixture(days);
      expect(await svc.processWithEngine('run')).toMatchObject({
        processed: 1,
        status: 'PROCESSED',
        errors: [],
      });
      expect(emp).toMatchObject({
        grossEarnings: String(expected),
        netPay: String(expected),
      });
      expect(svc.structureResolver.resolve).not.toHaveBeenCalled();
      const values = svc.persistComponentValues.mock.calls[0][3];
      expect(values.STIPEND).toBe(expected);
      expect(values.BASIC).toBeUndefined();
    },
  );

  it('uses calendar days in leap February', async () => {
    const { svc, emp } = fixture(14.5, 'CALENDAR_DAYS', 2, 2028);
    await svc.processWithEngine('run');
    expect(emp).toMatchObject({ totalDays: 29, grossEarnings: '13000' });
  });

  it('does not turn a zero-day attendance summary into a full stipend', async () => {
    const { svc, emp } = fixture(null);
    svc.attendanceService.getMonthlySummary.mockResolvedValue([
      {
        employeeCode: 'I001',
        totalDays: 30,
        effectivePresent: 0,
        lopDays: 30,
        holidays: 0,
        weekOffs: 0,
        daysOnLeave: 0,
      },
    ]);
    await svc.processWithEngine('run');
    expect(emp).toMatchObject({ grossEarnings: '0' });
  });

  it.each([-1, 31, Number.NaN])(
    'rejects invalid days %s without making the run submittable',
    async (days) => {
      const { svc, qr } = fixture(days);
      const result = await svc.processWithEngine('run');
      expect(result.status).toBe('DRAFT');
      expect(result.processed).toBe(0);
      expect(qr.rollbackTransaction).toHaveBeenCalled();
    },
  );

  it('rejects a regular employee in an intern run', async () => {
    const { svc, master } = fixture(26);
    master.payrollCategory = 'REGULAR';
    const result = await svc.processWithEngine('run');
    expect(result.processed).toBe(0);
    expect(result.errors[0]).toContain('category');
  });

  it('rejects missing stipend and another processed run in the same month', async () => {
    const { svc, master, manager } = fixture(26);
    master.monthlyGross = 0;
    expect((await svc.processWithEngine('run')).errors[0]).toContain(
      'monthly stipend',
    );
    master.monthlyGross = 26000;
    manager.query.mockResolvedValue([{ id: 'regular-run' }]);
    expect((await svc.processWithEngine('run')).errors[0]).toContain(
      'another processed payroll run',
    );
  });

  it('supports reprocessing an individual intern with the same proration', async () => {
    const { svc, manager } = fixture(13);
    expect(await svc.processSpecificEmployees('run', ['I001'])).toMatchObject({
      processed: 1,
      errors: [],
    });
    expect(manager.save).toHaveBeenCalledWith(
      PayrollRunEmployeeEntity,
      expect.objectContaining({ grossEarnings: '13000' }),
    );
  });
});
