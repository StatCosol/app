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
      expect(values.PF_DIFF).toBe(551); // ceil(1800 − 1249.5)
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

    it('caps ESI at the threshold mid-period when the wage exceeds it', () => {
      const res = svc.compute({
        values: { BASIC: 25000 },
        setup: setup({ pfEnabled: false }),
        components: [comp('BASIC', { esi: true })],
        periodMonth: 6, // mid-period
      });
      expect(res.values.ESI_WAGES).toBe(25000);
      expect(res.values.ESI_EMP).toBe(158); // ceil(0.75% of 21,000 = 157.5)
      expect(res.values.ESI_ER).toBe(683); // ceil(3.25% of 21,000 = 682.5)
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
});
