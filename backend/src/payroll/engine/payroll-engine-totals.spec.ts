import { PayrollEngineService } from './payroll-engine.service';

/**
 * Each component counted once, in the engine that actually runs.
 *
 * The review's F16 described this double-count in the legacy processor, and it
 * was real there — but nothing called that path. The engine has always skipped
 * the statutory codes when summing DEDUCTION/EMPLOYER components. These pin
 * that, so the property is guarded where the code lives rather than where the
 * finding pointed.
 *
 * Configuring PF_EMP as a deduction component is ordinary — it is how the
 * payslip lists it — and it is exactly the configuration that makes a
 * double-count possible.
 */
describe('payroll engine totals', () => {
  // Neither helper touches an injected dependency.
  const svc = new (PayrollEngineService as any)(...new Array(20).fill({}));

  const comp = (code: string, componentType: string) => ({
    code,
    componentType,
  });

  describe('employee deductions', () => {
    it('counts a statutory code once even when it is also a component', () => {
      const total = svc.sumDeductions({ GROSS: 15000, PF_EMP: 1800 }, [
        comp('BASIC', 'EARNING'),
        comp('PF_EMP', 'DEDUCTION'),
      ]);

      // 1800, not 3600 — so net is 13200, not 11400.
      expect(total).toBe(1800);
      expect(15000 - total).toBe(13200);
    });

    it('counts an ordinary deduction that is not statutory', () => {
      const total = svc.sumDeductions({ PF_EMP: 1800, ADVANCE: 500 }, [
        comp('PF_EMP', 'DEDUCTION'),
        comp('ADVANCE', 'DEDUCTION'),
      ]);
      expect(total).toBe(2300);
    });

    it('counts a statutory deduction with no configured component', () => {
      // The common case: PF_EMP exists only as a computed value.
      const total = svc.sumDeductions({ PF_EMP: 1800, PT: 200 }, [
        comp('BASIC', 'EARNING'),
      ]);
      expect(total).toBe(2000);
    });

    it('ignores earnings', () => {
      const total = svc.sumDeductions({ BASIC: 15000, HRA: 6000 }, [
        comp('BASIC', 'EARNING'),
        comp('HRA', 'EARNING'),
      ]);
      expect(total).toBe(0);
    });
  });

  describe('employer cost', () => {
    it('does not double-count an employer contribution', () => {
      const cost = svc.sumEmployerCost(
        { GROSS: 15000, PF_ER: 1950, ESI_ER: 487 },
        [comp('PF_ER', 'EMPLOYER'), comp('ESI_ER', 'EMPLOYER')],
      );
      expect(cost).toBe(15000 + 1950 + 487);
    });
  });
});
