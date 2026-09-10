import { PayrollProcessingService } from './payroll-processing.service';

/**
 * Each component counted once.
 *
 * The legacy processor summed every DEDUCTION-typed component and then added
 * the statutory codes from the computed values on top. Configuring PF_EMP as a
 * deduction component is an ordinary thing to do — it is how the payslip lists
 * it — so for those clients the amount was counted twice and every net pay in
 * the run was short by it. The employer cost double-counted the same way.
 */
describe('legacy payroll totals', () => {
  // sumTotals touches no injected dependency.
  const svc = new (PayrollProcessingService as any)(
    ...new Array(16).fill({}),
  ) as any;

  const comp = (code: string, componentType: string) => ({
    code,
    componentType,
  });

  it('counts a statutory code once even when it is also a configured component', () => {
    const { totalDeductions } = svc.sumTotals(
      { GROSS: 15000, PF_EMP: 1800 },
      [comp('BASIC', 'EARNING'), comp('PF_EMP', 'DEDUCTION')],
    );

    // 1800, not 3600 — so net is 13200, not 11400.
    expect(totalDeductions).toBe(1800);
    expect(15000 - totalDeductions).toBe(13200);
  });

  it('still counts an ordinary deduction that is not statutory', () => {
    const { totalDeductions } = svc.sumTotals(
      { GROSS: 15000, PF_EMP: 1800, ADVANCE: 500 },
      [comp('PF_EMP', 'DEDUCTION'), comp('ADVANCE', 'DEDUCTION')],
    );
    expect(totalDeductions).toBe(2300);
  });

  it('counts a statutory deduction that has no configured component', () => {
    // The common case: PF_EMP exists only as a computed value.
    const { totalDeductions } = svc.sumTotals({ PF_EMP: 1800, PT: 200 }, [
      comp('BASIC', 'EARNING'),
    ]);
    expect(totalDeductions).toBe(2000);
  });

  it('applies the same rule to employer cost', () => {
    const { employerCost } = svc.sumTotals(
      { PF_ER: 1950, ESI_ER: 487, GRATUITY_ER: 720 },
      [
        comp('PF_ER', 'EMPLOYER'),
        comp('ESI_ER', 'EMPLOYER'),
        comp('GRATUITY_ER', 'EMPLOYER'),
      ],
    );
    expect(employerCost).toBe(1950 + 487 + 720);
  });

  it('ignores earnings and unset values', () => {
    const { totalDeductions, employerCost } = svc.sumTotals(
      { BASIC: 15000, HRA: 6000 },
      [comp('BASIC', 'EARNING'), comp('HRA', 'EARNING')],
    );
    expect(totalDeductions).toBe(0);
    expect(employerCost).toBe(0);
  });
});
