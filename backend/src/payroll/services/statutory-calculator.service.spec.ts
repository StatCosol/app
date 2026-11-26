import { StatutoryCalculatorService } from './statutory-calculator.service';
import { PayrollClientSetupEntity } from '../entities/payroll-client-setup.entity';
import { PayrollComponentEntity } from '../entities/payroll-component.entity';

/**
 * StatutoryCalculatorService tests — PF & ESI computation.
 *
 * compute() is pure: it reads rates/ceilings from `setup`, wage-base flags
 * from `components`, and returns the augmented values map. These are the
 * statutory deductions, so the core paths are pinned down explicitly.
 */

const setup = (over: Partial<PayrollClientSetupEntity> = {}) =>
  ({
    pfEnabled: true,
    pfWageCeiling: 15000,
    pfEmployeeRate: 12,
    pfEmployerRate: 12,
    pfGrossThreshold: 0,
    esiEnabled: true,
    esiWageCeiling: 21000,
    esiEmployeeRate: 0.75,
    esiEmployerRate: 3.25,
    ...over,
  }) as unknown as PayrollClientSetupEntity;

const comp = (
  code: string,
  opts: { pf?: boolean; esi?: boolean; type?: string } = {},
) =>
  ({
    code,
    componentType: opts.type ?? 'EARNING',
    affectsPfWage: opts.pf ?? false,
    affectsEsiWage: opts.esi ?? false,
  }) as unknown as PayrollComponentEntity;

describe('StatutoryCalculatorService', () => {
  let svc: StatutoryCalculatorService;
  beforeEach(() => {
    svc = new StatutoryCalculatorService();
  });

  describe('PF', () => {
    it('caps the PF wage at the ceiling and splits EPS / EPF diff', () => {
      const { values } = svc.compute({
        values: { BASIC: 20000 },
        setup: setup(),
        components: [comp('BASIC', { pf: true })],
      });
      expect(values.PF_WAGES).toBe(20000); // uncapped base is reported
      expect(values.PF_EMP).toBe(1800); // 12% of capped 15,000
      expect(values.PF_ER).toBe(1800);
      expect(values.PF_EPS).toBe(1250); // ceil(8.33% of 15,000 = 1249.5)
      expect(values.PF_DIFF).toBe(550); // 1800 − 1250, so EPS + diff = ER
      expect(values.EPS_WAGES).toBe(15000);
    });

    it('zeroes all PF outputs when PF is disabled for the client', () => {
      const { values } = svc.compute({
        values: { BASIC: 20000 },
        setup: setup({ pfEnabled: false }),
        components: [comp('BASIC', { pf: true })],
      });
      expect(values.PF_EMP).toBe(0);
      expect(values.PF_ER).toBe(0);
      expect(values.PF_WAGES).toBe(0);
    });

    it('zeroes PF when the employee is not PF-applicable', () => {
      const { values } = svc.compute({
        values: { BASIC: 20000 },
        setup: setup(),
        components: [comp('BASIC', { pf: true })],
        pfApplicable: false,
      });
      expect(values.PF_EMP).toBe(0);
    });

    it('recovers employer PF from the employee when ACTUAL_GROSS ≥ 25,000', () => {
      const base = {
        setup: setup(),
        components: [comp('BASIC', { pf: true })],
      };
      const high = svc.compute({
        values: { BASIC: 20000, ACTUAL_GROSS: 30000 },
        ...base,
      });
      const low = svc.compute({
        values: { BASIC: 20000, ACTUAL_GROSS: 20000 },
        ...base,
      });
      expect(high.values.PF_ER_FROM_EMP).toBe(1800);
      expect(low.values.PF_ER_FROM_EMP).toBe(0);
    });
  });

  describe('ESI', () => {
    it('deducts ESI when the wage is within the threshold', () => {
      const { values } = svc.compute({
        values: { BASIC: 15000 },
        setup: setup({ pfEnabled: false }),
        components: [comp('BASIC', { esi: true })],
      });
      expect(values.ESI_WAGES).toBe(15000);
      expect(values.ESI_EMP).toBe(113); // ceil(0.75% of 15,000 = 112.5)
      expect(values.ESI_ER).toBe(488); // ceil(3.25% of 15,000 = 487.5)
    });

    // Confirmed 2026-11-26: actual wages, not the ₹21,000 cap.
    it('charges ESI on actual wages mid-period when the wage exceeds the threshold', () => {
      const res = svc.compute({
        values: { BASIC: 25000 },
        setup: setup({ pfEnabled: false }),
        components: [comp('BASIC', { esi: true })],
        periodMonth: 6, // mid-period
      });
      expect(res.values.ESI_WAGES).toBe(25000);
      expect(res.values.ESI_EMP).toBe(188); // ceil(0.75% of 25,000 = 187.5)
      expect(res.values.ESI_ER).toBe(813); // ceil(3.25% of 25,000 = 812.5)
      expect(res.esiDroppedAtPeriodStart).toBeUndefined();
    });

    it('drops ESI for the period when the wage exceeds the threshold at a period start', () => {
      const res = svc.compute({
        values: { BASIC: 25000 },
        setup: setup({ pfEnabled: false }),
        components: [comp('BASIC', { esi: true })],
        periodMonth: 4, // April → H1 period start
      });
      expect(res.esiDroppedAtPeriodStart).toBe(true);
      expect(res.values.ESI_EMP).toBe(0);
      expect(res.values.ESI_ER).toBe(0);
    });
  });

  describe('GROSS & payable days', () => {
    it('sets GROSS to the sum of EARNING components plus overtime', () => {
      const { values } = svc.compute({
        values: { BASIC: 20000, HRA: 8000, OT_AMOUNT: 2000 },
        setup: setup({ pfEnabled: false, esiEnabled: false }),
        components: [comp('BASIC'), comp('HRA')],
      });
      expect(values.GROSS).toBe(30000);
    });

    it('skips PF/ESI wages when payable days is 0', () => {
      const { values } = svc.compute({
        values: { BASIC: 20000, PAYABLE_DAYS: 0 },
        setup: setup(),
        components: [comp('BASIC', { pf: true, esi: true })],
      });
      expect(values.PF_EMP).toBe(0);
      expect(values.ESI_EMP).toBe(0);
    });
  });

  describe('regressions from the 2026-11 payroll bug hunt', () => {
    it('keeps EPS + EPF diff equal to the employer share for every wage', () => {
      for (let basic = 1000; basic <= 15000; basic += 7) {
        const { values } = svc.compute({
          values: { BASIC: basic },
          setup: setup(),
          components: [comp('BASIC', { pf: true })],
        });
        expect(values.PF_EPS + values.PF_DIFF).toBe(values.PF_ER);
      }
    });

    it('gives the whole employer share to EPF when EPS is excluded', () => {
      const { values } = svc.compute({
        values: { BASIC: 20000 },
        setup: setup(),
        components: [comp('BASIC', { pf: true })],
        pfServiceStartDate: '2020-01-01',
        basicAtPfStart: 20000,
      });
      expect(values.PF_EPS).toBe(0);
      expect(values.PF_DIFF).toBe(values.PF_ER);
    });

    it('keeps the approved holiday double wage in GROSS and ESI wages', () => {
      const { values } = svc.compute({
        values: { BASIC: 15000, OT_AMOUNT: 1000, HOLIDAY_DBL_AMOUNT: 600 },
        setup: setup(),
        components: [comp('BASIC', { pf: true, esi: true })],
        periodMonth: 7,
      });
      expect(values.GROSS).toBe(16600);
      expect(values.ESI_WAGES).toBe(16600);
      expect(values.PF_WAGES).toBe(15000); // PF excludes OT and holiday extra
    });

    it('does not count HOLIDAY_DBL_AMOUNT twice when it is a configured earning', () => {
      const { values } = svc.compute({
        values: { BASIC: 15000, HOLIDAY_DBL_AMOUNT: 600 },
        setup: setup(),
        components: [
          comp('BASIC', { esi: true }),
          comp('HOLIDAY_DBL_AMOUNT', { esi: true }),
        ],
      });
      expect(values.GROSS).toBe(15600);
    });

    it('does not drop an employee from ESI at period start because of overtime', () => {
      const result = svc.compute({
        values: { BASIC: 20000, OT_AMOUNT: 1500 },
        setup: setup(),
        components: [comp('BASIC', { esi: true })],
        periodMonth: 4,
      });
      expect(result.esiDroppedAtPeriodStart).toBeUndefined();
      // Contribution is still due on the overtime.
      expect(result.values.ESI_WAGES).toBe(21500);
      expect(result.values.ESI_EMP).toBe(Math.ceil((21500 * 0.75) / 100));
    });

    it('still drops ESI at period start when regular wages exceed the ceiling', () => {
      const result = svc.compute({
        values: { BASIC: 22000 },
        setup: setup(),
        components: [comp('BASIC', { esi: true })],
        periodMonth: 10,
      });
      expect(result.esiDroppedAtPeriodStart).toBe(true);
      expect(result.values.ESI_EMP).toBe(0);
    });

    it('does not drop ESI for a zero-payable-days month', () => {
      const result = svc.compute({
        values: { BASIC: 30000, PAYABLE_DAYS: 0 },
        setup: setup(),
        components: [comp('BASIC', { esi: true })],
        periodMonth: 4,
      });
      expect(result.esiDroppedAtPeriodStart).toBeUndefined();
    });
    describe('coverage is decided on fixed gross only', () => {
      const esiComps = [
        comp('BASIC', { esi: true }),
        comp('OTHER_EARNINGS', { esi: true }),
      ];

      it('keeps a ₹20,000 fixed-gross employee covered at period start despite an incentive', () => {
        const result = svc.compute({
          values: { ACTUAL_GROSS: 20000, BASIC: 20000, OTHER_EARNINGS: 3000 },
          setup: setup({ pfEnabled: false }),
          components: esiComps,
          periodMonth: 4,
        });
        expect(result.esiDroppedAtPeriodStart).toBeUndefined();
        // Contribution is on actual total wages, incentive included.
        expect(result.values.ESI_WAGES).toBe(23000);
        expect(result.values.ESI_EMP).toBe(Math.ceil((23000 * 0.75) / 100));
        expect(result.values.ESI_ER).toBe(Math.ceil((23000 * 3.25) / 100));
      });

      it('keeps the employee covered with OT, holiday wage and incentive together', () => {
        const result = svc.compute({
          values: {
            ACTUAL_GROSS: 21000,
            BASIC: 21000,
            OTHER_EARNINGS: 2000,
            OT_AMOUNT: 1800,
            HOLIDAY_DBL_AMOUNT: 800,
          },
          setup: setup({ pfEnabled: false }),
          components: esiComps,
          periodMonth: 10,
        });
        expect(result.esiDroppedAtPeriodStart).toBeUndefined();
        expect(result.values.ESI_WAGES).toBe(25600);
        expect(result.values.ESI_EMP).toBe(Math.ceil((25600 * 0.75) / 100));
      });

      it('keeps a covered employee in ESI after a mid-period wage increase', () => {
        const result = svc.compute({
          values: { ACTUAL_GROSS: 24000, BASIC: 24000 },
          setup: setup({ pfEnabled: false }),
          components: esiComps,
          periodMonth: 7,
        });
        expect(result.esiDroppedAtPeriodStart).toBeUndefined();
        expect(result.values.ESI_WAGES).toBe(24000);
        expect(result.values.ESI_EMP).toBe(180);
      });

      it('re-checks at the next period start and drops when fixed gross is above ₹21,000', () => {
        const result = svc.compute({
          values: { ACTUAL_GROSS: 24000, BASIC: 24000 },
          setup: setup({ pfEnabled: false }),
          components: esiComps,
          periodMonth: 10,
        });
        expect(result.esiDroppedAtPeriodStart).toBe(true);
        expect(result.values.ESI_EMP).toBe(0);
      });

      it('does not keep an above-ceiling employee in ESI just because attendance cut earned pay', () => {
        // Fixed gross ₹23,000, but leave in April brought earned pay to ₹19,000.
        const result = svc.compute({
          values: { ACTUAL_GROSS: 23000, BASIC: 19000 },
          setup: setup({ pfEnabled: false }),
          components: esiComps,
          periodMonth: 4,
        });
        expect(result.esiDroppedAtPeriodStart).toBe(true);
      });

      it('treats exactly ₹21,000 fixed gross as covered', () => {
        const result = svc.compute({
          values: { ACTUAL_GROSS: 21000, BASIC: 21000 },
          setup: setup({ pfEnabled: false }),
          components: esiComps,
          periodMonth: 4,
        });
        expect(result.esiDroppedAtPeriodStart).toBeUndefined();
        expect(result.values.ESI_EMP).toBe(158);
      });
    });
  });
});
