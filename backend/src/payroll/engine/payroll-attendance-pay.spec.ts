import { PayrollEngineService } from './payroll-engine.service';
import { WageBaseService } from './wage-base.service';
import { StatutoryCalculatorService } from '../services/statutory-calculator.service';
import { EmployeeEntity } from '../../employees/entities/employee.entity';

/**
 * Regular payroll driven by approved attendance.
 *
 * Pins four defects found in the 2026-11 bug hunt:
 *  - an all-absent month paid as a full month (`daysPresent || 26`);
 *  - payable days above the wage divisor paying more than the monthly rate;
 *  - HR-approved holiday double wage never reaching the run;
 *  - the automatic ESI opt-out written outside the run's transaction.
 */
describe('Regular payroll from approved attendance', () => {
  function fixture(opts: {
    present: number;
    holidays?: number;
    month?: number;
    basic?: number;
    esi?: boolean;
    holidayDoubleDays?: Record<string, number>;
    otHours?: number;
    /** Employee master ESI flag; defaults to `esi`. */
    masterEsi?: boolean;
    esiCeilingExcludedOn?: string | null;
  }) {
    const run = {
      id: 'run',
      clientId: 'client',
      payrollCategory: 'REGULAR',
      periodYear: 2026,
      periodMonth: opts.month ?? 7,
      status: 'DRAFT',
    };
    const emp: Record<string, any> = {
      id: 'run-emp',
      employeeId: 'emp',
      employeeCode: 'E001',
      totalDays: 0,
      daysPresent: 0,
      lopDays: 0,
      ncpDays: 0,
      otHours: 0,
    };
    const basic = opts.basic ?? 26000;
    const master = {
      id: 'emp',
      payrollCategory: 'REGULAR',
      monthlyGross: basic,
      pfApplicable: false,
      esiApplicable: opts.masterEsi ?? !!opts.esi,
      esiCeilingExcludedOn: opts.esiCeilingExcludedOn ?? null,
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
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn((_entity, data) => data),
      save: jest.fn(async (_entity, data) => data),
      createQueryBuilder: () => builder,
    };
    const qr = {
      manager,
      query: jest.fn().mockResolvedValue([{ acquired: true }]),
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
          wageBasisDays: 'FIXED_26',
          pfEnabled: false,
          esiEnabled: !!opts.esi,
          esiWageCeiling: 21000,
          esiEmployeeRate: 0.75,
          esiEmployerRate: 3.25,
          ptEnabled: false,
          lwfEnabled: false,
        }),
      },
      compRepo: {
        find: jest.fn().mockResolvedValue([
          {
            code: 'BASIC',
            componentType: 'EARNING',
            affectsEsiWage: true,
          },
        ]),
      },
      compValRepo: {
        // Salary supplied as an uploaded breakup so no structure is needed.
        find: jest
          .fn()
          .mockResolvedValue([
            { componentCode: 'BASIC', amount: basic },
            ...(opts.otHours
              ? [{ componentCode: 'OT_HOURS', amount: opts.otHours }]
              : []),
          ]),
      },
      empRepo: {
        findOne: jest.fn().mockResolvedValue(master),
        update: jest.fn(),
      },
      ds: { createQueryRunner: () => qr },
      attendanceService: {
        getMonthlySummary: jest.fn().mockResolvedValue([
          {
            employeeId: 'emp',
            employeeCode: 'E001',
            totalDays: 31,
            effectivePresent: opts.present,
            lopDays: Math.max(0, 31 - opts.present - (opts.holidays ?? 0)),
            holidays: opts.holidays ?? 0,
            weekOffs: 0,
            daysOnLeave: 0,
          },
        ]),
      },
      holidayCalendar: opts.holidayDoubleDays
        ? {
            getApprovedHolidayWorkDays: jest
              .fn()
              .mockResolvedValue(opts.holidayDoubleDays),
          }
        : undefined,
      structureResolver: { resolve: jest.fn().mockResolvedValue(null) },
      leaveBalanceRepo: { findOne: jest.fn().mockResolvedValue(null) },
      leavePolicyRepo: { count: jest.fn().mockResolvedValue(0) },
      wageBase: new WageBaseService(),
      statutory: new StatutoryCalculatorService(),
      tdsCalc: { calculate: jest.fn().mockReturnValue({ monthlyTds: 0 }) },
      resolveMinWage: jest.fn().mockResolvedValue(0),
      resolveClientScheduledEmployment: jest.fn().mockResolvedValue(null),
      persistComponentValues: jest.fn().mockResolvedValue(undefined),
    });
    const values = () => svc.persistComponentValues.mock.calls[0][3];
    return { svc, emp, manager, values };
  }

  it('pays nothing for a month of approved absences', async () => {
    const { svc, emp, values } = fixture({ present: 0 });
    expect((await svc.processWithEngine('run')).status).toBe('PROCESSED');
    expect(values().WORKED_DAYS).toBe(0);
    expect(values().PAYABLE_DAYS).toBe(0);
    expect(emp.grossEarnings).toBe('0');
  });

  it('pays part of the month for part attendance', async () => {
    const { svc, emp } = fixture({ present: 13 });
    await svc.processWithEngine('run');
    expect(emp.grossEarnings).toBe('13000');
  });

  it('never pays more than the monthly rate when payable days exceed 26', async () => {
    const { svc, emp, values } = fixture({ present: 27, holidays: 1 });
    await svc.processWithEngine('run');
    expect(values().PAYABLE_DAYS).toBe(26);
    expect(emp.grossEarnings).toBe('26000');
  });

  it('pays the HR-approved holiday double wage on top of salary', async () => {
    const { svc, emp, values } = fixture({
      present: 26,
      holidayDoubleDays: { emp: 1 },
    });
    await svc.processWithEngine('run');
    expect(values().HOLIDAY_DBL_DAYS).toBe(1);
    expect(values().HOLIDAY_DBL_AMOUNT).toBe(1000); // 26,000 / 26
    expect(emp.grossEarnings).toBe('27000');
    expect(emp.netPay).toBe('27000');
  });

  it('records an automatic ESI opt-out inside the run transaction', async () => {
    const { svc, manager } = fixture({
      present: 26,
      basic: 22000,
      esi: true,
      month: 4,
    });
    await svc.processWithEngine('run');
    expect(manager.update).toHaveBeenCalledWith(
      EmployeeEntity,
      { id: 'emp' },
      { esiApplicable: false, esiCeilingExcludedOn: '2026-04-01' },
    );
    expect(svc.empRepo.update).not.toHaveBeenCalled();
  });

  describe("Madan's ESI examples through a full payroll run", () => {
    it('X: ₹20,000 fixed with ₹3,000 OT in December stays in ESI', async () => {
      // 15.6 OT hours × (20,000 / 26 / 8) × 2 = ₹3,000.
      const { svc, manager, values } = fixture({
        present: 26,
        basic: 20000,
        esi: true,
        month: 12,
        otHours: 15.6,
      });
      await svc.processWithEngine('run');
      expect(values().OT_AMOUNT).toBe(3000);
      expect(values().ESI_WAGES).toBe(23000);
      expect(values().ESI_EMP).toBe(173);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('Y: ₹23,000 fixed working 15 days (₹11,500) is not put into ESI', async () => {
      const { svc, manager, values } = fixture({
        present: 15,
        basic: 23000,
        esi: true,
        masterEsi: false, // kept out when registered above ₹21,000
        month: 12,
      });
      await svc.processWithEngine('run');
      expect(values().BASIC).toBeCloseTo(13269.23, 1); // 23,000 × 15 / 26 days
      expect(values().ESI_EMP).toBe(0);
      expect(values().ESI_ER).toBe(0);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('Y in October: low earned pay does not bring them back into ESI', async () => {
      const { svc, manager, values } = fixture({
        present: 15,
        basic: 23000,
        esi: true,
        masterEsi: false,
        esiCeilingExcludedOn: '2026-04-01',
        month: 10,
      });
      await svc.processWithEngine('run');
      expect(values().ESI_EMP).toBe(0);
      expect(manager.update).not.toHaveBeenCalled();
    });
  });

  describe('ESI re-check at the next contribution period', () => {
    it('brings a ceiling-excluded employee back into ESI in October at ₹21,000 or less', async () => {
      const { svc, manager, values } = fixture({
        present: 26,
        basic: 20000,
        esi: true,
        masterEsi: false,
        esiCeilingExcludedOn: '2026-04-01',
        month: 10,
      });
      await svc.processWithEngine('run');
      expect(values().ESI_EMP).toBe(150); // 0.75% of 20,000, charged this run
      expect(manager.update).toHaveBeenCalledWith(
        EmployeeEntity,
        { id: 'emp' },
        { esiApplicable: true, esiCeilingExcludedOn: null },
      );
    });

    it('keeps them out in October while fixed gross is still above ₹21,000', async () => {
      const { svc, manager, values } = fixture({
        present: 26,
        basic: 23000,
        esi: true,
        masterEsi: false,
        esiCeilingExcludedOn: '2026-04-01',
        month: 10,
      });
      await svc.processWithEngine('run');
      expect(values().ESI_EMP).toBe(0);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('never re-includes mid-period, only at a period start', async () => {
      const { svc, manager, values } = fixture({
        present: 26,
        basic: 20000,
        esi: true,
        masterEsi: false,
        esiCeilingExcludedOn: '2026-04-01',
        month: 7,
      });
      await svc.processWithEngine('run');
      expect(values().ESI_EMP).toBe(0);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('leaves a manual HR exclusion alone', async () => {
      const { svc, manager, values } = fixture({
        present: 26,
        basic: 20000,
        esi: true,
        masterEsi: false,
        esiCeilingExcludedOn: null,
        month: 10,
      });
      await svc.processWithEngine('run');
      expect(values().ESI_EMP).toBe(0);
      expect(manager.update).not.toHaveBeenCalled();
    });
  });

  it('never removes anyone from ESI because of overtime', async () => {
    // ₹20,000 basic + 20 OT hours (₹20,000 / 26 / 8 × 2 × 20 ≈ ₹3,846) in
    // April, the start of a contribution period: wages with OT are above
    // ₹21,000, regular wages are not.
    const { svc, manager, values } = fixture({
      present: 26,
      basic: 20000,
      esi: true,
      month: 4,
      otHours: 20,
    });
    await svc.processWithEngine('run');
    expect(values().OT_AMOUNT).toBeGreaterThan(1000);
    expect(values().ESI_WAGES).toBeGreaterThan(21000);
    expect(values().ESI_EMP).toBeGreaterThan(0); // still charged, on OT too
    expect(manager.update).not.toHaveBeenCalled();
    expect(svc.empRepo.update).not.toHaveBeenCalled();
  });
});
