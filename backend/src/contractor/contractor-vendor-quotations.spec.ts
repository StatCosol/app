import {
  calculateRateCard,
  calculateRateCardSegments,
  ContractorRateCard,
  proratedEarningsDayRate,
  RateComponent,
  rateCardPaysOvertime,
  validateRateCard,
} from './contractor-rate-card';

/**
 * Five real vendor wage breakups, each laid out and calculated differently,
 * rebuilt as quotations. Every expected figure is the vendor's own Excel
 * result; the engine must reproduce them to the paisa (within rounding of
 * each line to paise, which the vendors' sheets do not do).
 */
type Category = RateComponent['category'];
const line = (
  code: string,
  category: Category,
  spec: number | string,
  options: { prorate?: boolean; billable?: boolean } = {},
): RateComponent => ({
  code,
  label: code,
  category,
  ...(typeof spec === 'number'
    ? { method: 'FIXED' as const, value: spec }
    : { method: 'FORMULA' as const, value: 0, formula: spec }),
  prorate: options.prorate ?? false,
  ...(options.billable != null ? { billable: options.billable } : {}),
});
const card = (components: RateComponent[]): ContractorRateCard => ({
  divisor: 26,
  rounding: 'PAISE',
  components,
});
const near = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThan(0.05);

// Vendors A and B: per-day wage × 26, leave as 1.5 days, statutory on
// Basic + Bonus + Leave; B adds travel and a larger flat fee.
const packing = (
  perDay: number,
  basic: number,
  fee: number,
  pt: number,
  travel?: number,
) =>
  card([
    line('PER_DAY', 'SUBTOTAL', perDay),
    line('BASIC_DA', 'EARNING', basic, { prorate: true }),
    line('LEAVE', 'EARNING', '1.5 * PER_DAY', { prorate: true }),
    line('BONUS', 'EARNING', '(BASIC_DA + LEAVE) * 8.33%'),
    ...(travel ? [line('TRAVEL', 'EMPLOYER_COST', travel)] : []),
    line('PF_ER', 'EMPLOYER_COST', 'ROUND(MIN(BASIC_DA, 15000) * 13%, 0)'),
    line('ESI_ER', 'EMPLOYER_COST', '(BASIC_DA + BONUS + LEAVE) * 3.25%'),
    line('SERVICE', 'BILLING_FEE', fee),
    line('PF_EMP', 'DEDUCTION', 'ROUND(MIN(BASIC_DA, 15000) * 12%, 0)'),
    line('ESI_EMP', 'DEDUCTION', '(BASIC_DA + BONUS + LEAVE) * 0.75%'),
    line('PT', 'DEDUCTION', pt),
  ]);

// Vendor C: basic rounded up from the per-day wage, 5% leave, a special
// allowance inside the ESI base but outside the bonus base.
const housekeeping = (special: number) =>
  card([
    line('PER_DAY', 'SUBTOTAL', 615),
    line('BASIC_DA', 'EARNING', 'ROUNDUP(PER_DAY * 26, 0)', { prorate: true }),
    line('SPECIAL', 'EARNING', special, { prorate: true }),
    line('LEAVE', 'EARNING', 'BASIC_DA * 5%'),
    line('BONUS', 'EARNING', '(BASIC_DA + LEAVE) * 8.33%'),
    line('PF_ER', 'EMPLOYER_COST', 1950),
    line(
      'ESI_ER',
      'EMPLOYER_COST',
      '(BASIC_DA + SPECIAL + BONUS + LEAVE) * 3.25%',
    ),
    line('SERVICE', 'BILLING_FEE', 800),
    line('PF_EMP', 'DEDUCTION', 'ROUND(MIN(BASIC_DA, 15000) * 12%, 0)'),
    line(
      'ESI_EMP',
      'DEDUCTION',
      '(BASIC_DA + BONUS + LEAVE + SPECIAL) * 0.75%',
    ),
    line('PT', 'DEDUCTION', 150),
  ]);

// Vendor D: Labour Code derived wage, statutory on the derived wage, leave
// billed on salary + statutory but paid on the derived wage, 10% fee on the
// manpower cost, and a separately priced overtime hour.
const derivedWage = (basic: number, conveyance: number, pt: number) =>
  card([
    line('BASIC_DA', 'EARNING', basic, { prorate: true }),
    line('CONVEYANCE', 'EARNING', conveyance, { prorate: true }),
    line(
      'EXCLUDED',
      'SUBTOTAL',
      'CONVEYANCE + MIN(BASIC_DA, 15000) * 12% + MAX(BASIC_DA, 7000) * 8.33%',
    ),
    line('REMUNERATION', 'SUBTOTAL', 'BASIC_DA + EXCLUDED + BASIC_DA * 4.81%'),
    line(
      'DERIVED',
      'SUBTOTAL',
      'BASIC_DA + MAX(EXCLUDED - REMUNERATION / 2, 0)',
    ),
    line('PF_ER', 'EMPLOYER_COST', 'MIN(DERIVED, 15000) * 12%'),
    line('PF_ADMIN', 'EMPLOYER_COST', 'MIN(DERIVED, 15000) * 1%'),
    line(
      'ESI_ER',
      'EMPLOYER_COST',
      'IF(FULL(DERIVED) >= 21000, 1221, DERIVED * 3.25%)',
    ),
    line('GRATUITY', 'EMPLOYER_COST', 'DERIVED * 4.81%'),
    line('BONUS', 'EARNING', 'MAX(DERIVED, 7000) * 8.33%'),
    line('LWF_ER', 'EMPLOYER_COST', '5/12'),
    line('LEAVE', 'EARNING', 'DERIVED * 4.81%', { billable: false }),
    line(
      'LEAVE_BILLED',
      'EMPLOYER_COST',
      '(BASIC_DA + CONVEYANCE + PF_ER + PF_ADMIN + ESI_ER + GRATUITY + BONUS + LWF_ER) * 4.81%',
    ),
    line('TRAINING', 'EMPLOYER_COST', '(BASIC_DA + CONVEYANCE) * 1%'),
    line('UNIFORM', 'EMPLOYER_COST', 450),
    line(
      'MANPOWER',
      'SUBTOTAL',
      'BASIC_DA + CONVEYANCE + PF_ER + PF_ADMIN + ESI_ER + GRATUITY + BONUS + LWF_ER + LEAVE_BILLED + TRAINING + UNIFORM',
    ),
    line('SERVICE_FEE', 'BILLING_FEE', 'MANPOWER * 10%'),
    line('OT', 'EARNING', 'FULL(DERIVED) / 208 * 2 * OT_HOURS'),
    line('OT_ESI', 'EMPLOYER_COST', 'IF(FULL(DERIVED) > 21000, 0, OT * 3.25%)'),
    line('OT_FEE', 'BILLING_FEE', '(OT + OT_ESI) * 10%'),
    line('PF_EMP', 'DEDUCTION', 'MIN(DERIVED, 15000) * 12%'),
    line(
      'ESI_EMP',
      'DEDUCTION',
      'IF(FULL(DERIVED) > 21000, 0, DERIVED * 0.75%)',
    ),
    line('PT', 'DEDUCTION', pt),
    line('LWF_EMP', 'DEDUCTION', '2/12'),
  ]);

// Vendor E: billing quotation — statutory on Basic only, bonus/leave/NFH
// billed as costs, management fee on Sub Total 3, rate per day.
const security = (basic: number, site: number) =>
  card([
    line('BASIC_DA', 'EARNING', basic, { prorate: true }),
    line('SITE', 'EARNING', site, { prorate: true }),
    line('GROSS', 'SUBTOTAL', 'BASIC_DA + SITE'),
    line('PF_ER', 'EMPLOYER_COST', 'MIN(BASIC_DA, 15000) * 13%'),
    line('ESI_ER', 'EMPLOYER_COST', 'BASIC_DA * 3.25%'),
    line('BONUS', 'EMPLOYER_COST', 'BASIC_DA * 8.33%'),
    line('LEAVE', 'EMPLOYER_COST', 'BASIC_DA * 4.81%'),
    line('NFH', 'EMPLOYER_COST', 'BASIC_DA * 2.88%'),
    line('LWF_ER', 'EMPLOYER_COST', 0.42),
    line('UNIFORM', 'EMPLOYER_COST', 450),
    line(
      'SUB_TOTAL_3',
      'SUBTOTAL',
      'GROSS + PF_ER + ESI_ER + BONUS + LEAVE + NFH + LWF_ER + UNIFORM',
    ),
    line('MGMT_FEE', 'BILLING_FEE', 'SUB_TOTAL_3 * 6.51%'),
    line('RATE_PER_DAY', 'SUBTOTAL', '(SUB_TOTAL_3 + MGMT_FEE) / 26'),
  ]);

describe('vendor quotations reproduce the vendor sheets', () => {
  it('vendor A (flat ₹765 fee) — female and male', () => {
    const female = calculateRateCard(packing(577, 15002, 765, 150), 26);
    near(female.amounts.LEAVE, 865.5);
    near(female.amounts.BONUS, 1321.76);
    near(female.amounts.ESI_ER, 558.65);
    near(female.billingTotal, 20462.91);
    near(female.deductions, 2078.92);
    near(female.netPay, 15110.34);
    const male = calculateRateCard(packing(615, 16000, 765, 150), 26);
    near(male.amounts.LEAVE, 922.5);
    near(male.billingTotal, 21642.94);
    near(male.netPay, 16244.65);
  });

  it('vendor B (travel + ₹1,000 fee) — three skill levels', () => {
    for (const [perDay, pt, ctc, net] of [
      [577, 150, 22197.91, 15110.34],
      [618, 150, 23459.03, 16322.6],
      [753, 200, 27611.49, 20264.19],
    ]) {
      const r = calculateRateCard(
        packing(perDay, perDay * 26, 1000, pt, 1500),
        26,
      );
      near(r.billingTotal, ctc);
      near(r.netPay, net);
    }
  });

  it('vendor C (5% leave, special allowance)', () => {
    const full = calculateRateCard(housekeeping(1500), 26);
    near(full.amounts.BASIC_DA, 15990);
    near(full.amounts.ESI_ER, 639.86);
    near(full.billingTotal, 23077.93);
    near(full.netPay, 17590.4);
    const reduced = calculateRateCard(housekeeping(30), 26);
    near(reduced.billingTotal, 21560.15);
    near(reduced.netPay, 16131.43);
  });

  it('vendor D (derived wage, 10% fee) — both revisions, staff and supervisor', () => {
    for (const [basic, conveyance, pt, bill, net] of [
      [12778, 1500, 150, 21443.49, 14177.67],
      [14546, 5500, 200, 28755.99, 19902.56],
      [15000, 1500, 150, 24782.6, 16408.33],
      [17500, 5500, 200, 32820.42, 23168.08],
    ]) {
      const r = calculateRateCard(derivedWage(basic, conveyance, pt), 26);
      near(r.billingTotal, bill);
      near(r.netPay, net);
    }
  });

  it('vendor D bills leave above what it pays, and the gap is visible', () => {
    const r = calculateRateCard(derivedWage(15000, 1500, 150), 26);
    near(r.amounts.LEAVE, 721.5);
    near(r.amounts.LEAVE_BILLED, 1005.72);
    near(r.unbilledEarnings, 721.5);
  });

  it('vendor D prices an overtime hour as wage + ESI + fee', () => {
    const quote = derivedWage(15000, 1500, 150);
    expect(rateCardPaysOvertime(quote)).toBe(true);
    const base = calculateRateCard(quote, 26);
    const withOt = calculateRateCard(quote, 26, [], 10);
    near(withOt.amounts.OT, 1442.31);
    near(withOt.billingTotal - base.billingTotal, 1638.1);
  });

  it('vendor D adds the excess back when allowances exceed half of pay', () => {
    const r = calculateRateCard(derivedWage(10000, 12000, 200), 26);
    near(r.amounts.DERIVED, 11776);
    near(r.amounts.PF_EMP, 1413.12);
  });

  it('vendor E (billing quotation, 6.51% fee, rate per day)', () => {
    const guard = calculateRateCard(security(16000, 2000), 26);
    near(guard.billingTotal, 25012.4);
    near(guard.amounts.RATE_PER_DAY, 962.02);
    expect(guard.deductions).toBe(0);
    const supervisor = calculateRateCard(security(20000, 2150), 26);
    near(supervisor.billingTotal, 30253.55);
    near(supervisor.amounts.RATE_PER_DAY, 1163.6);
  });
});

describe('formula quotations in a payroll month', () => {
  it('prorates monthly figures and derives the rest from earned amounts', () => {
    const r = calculateRateCard(security(16000, 2000), 13);
    expect(r.amounts.BASIC_DA).toBe(8000);
    expect(r.amounts.PF_ER).toBe(1040);
    expect(r.amounts.UNIFORM).toBe(450);
  });

  it('judges ESI eligibility on the full-month wage, not a short month', () => {
    const r = calculateRateCard(derivedWage(22000, 0, 200), 13);
    near(r.amounts.DERIVED, 11000);
    expect(r.amounts.ESI_EMP).toBe(0);
  });

  it('charges flat monthly amounts once across a mid-month revision', () => {
    const r = calculateRateCardSegments([
      { card: packing(577, 15002, 765, 150), days: 13, hours: 0 },
      { card: packing(615, 15990, 765, 150), days: 13, hours: 0 },
    ]);
    expect(r.amounts.SERVICE).toBe(765);
    expect(r.amounts.PT).toBe(150);
    near(r.amounts.BASIC_DA, 15496);
  });

  it('keeps leave and bonus out of the Sunday day rate', () => {
    expect(proratedEarningsDayRate(packing(577, 15002, 765, 150))).toBe(577);
    expect(rateCardPaysOvertime(packing(577, 15002, 765, 150))).toBe(false);
  });

  it('rejects formulas that would double-prorate or read unknown lines', () => {
    const twice = packing(577, 15002, 765, 150);
    twice.components[3].prorate = true;
    expect(() => validateRateCard(twice)).toThrow('do not prorate it again');
    const forward = packing(577, 15002, 765, 150);
    forward.components[3].formula = 'BASIC_DA + PT';
    expect(() => validateRateCard(forward)).toThrow('unknown: PT');
    const broken = packing(577, 15002, 765, 150);
    broken.components[3].formula = '(BASIC_DA + LEAVE * 8.33%';
    expect(() => validateRateCard(broken)).toThrow('Formula for BONUS');
    const billable = packing(577, 15002, 765, 150);
    billable.components.find((c) => c.code === 'SERVICE')!.billable = false;
    expect(() => validateRateCard(billable)).toThrow('SERVICE');
  });
});
