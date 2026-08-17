import { TdsCalculatorService } from './tds-calculator.service';

/**
 * India Income Tax (TDS) Calculator tests — New & Old regimes.
 * Expected values are hand-computed from the documented FY slabs, the ₹75k/₹50k
 * standard deductions, 87A rebate rules, and 4% cess.
 */
describe('TdsCalculatorService', () => {
  let svc: TdsCalculatorService;

  beforeEach(() => {
    svc = new TdsCalculatorService();
  });

  it('defaults to the NEW regime', () => {
    const r = svc.calculate({ annualGross: 1000000 });
    expect(r.regime).toBe('NEW');
    expect(r.standardDeduction).toBe(75000);
  });

  it('NEW regime: full 87A rebate when taxable income ≤ ₹12L', () => {
    const r = svc.calculate({ annualGross: 1000000, regime: 'NEW' });
    // taxable = 1,000,000 − 75,000 = 925,000 ≤ 12L → full rebate → zero tax
    expect(r.taxableIncome).toBe(925000);
    expect(r.totalTaxLiability).toBe(0);
    expect(r.monthlyTds).toBe(0);
  });

  it('NEW regime: slab tax + 4% cess above the rebate threshold', () => {
    const r = svc.calculate({ annualGross: 1500000, regime: 'NEW' });
    // taxable = 1,425,000 (> 12L, no rebate)
    //   5%  slab: 20,000 | 10% slab: 40,000 | 15% slab: 33,750  => 93,750
    expect(r.taxableIncome).toBe(1425000);
    expect(r.taxBeforeCess).toBe(93750);
    expect(r.rebate87A).toBe(0);
    expect(r.cess).toBe(3750); // 4% of 93,750
    expect(r.totalTaxLiability).toBe(97500);
    expect(r.monthlyTds).toBe(8125); // 97,500 / 12
  });

  it('OLD regime: aggregates deductions and caps 80C at ₹1.5L', () => {
    const r = svc.calculate({
      annualGross: 1200000,
      regime: 'OLD',
      deduction80C: 200000, // capped to 150,000
      deduction80D: 25000,
    });
    expect(r.standardDeduction).toBe(50000);
    expect(r.totalExemptions).toBe(175000); // 150,000 (capped) + 25,000
    // taxable = 1,200,000 − 50,000 − 175,000 = 975,000
    expect(r.taxableIncome).toBe(975000);
    //   5% slab: 12,500 | 20% slab: 95,000  => 107,500
    expect(r.taxBeforeCess).toBe(107500);
    expect(r.cess).toBe(4300); // 4% of 107,500
    expect(r.totalTaxLiability).toBe(111800);
  });

  it('OLD regime: 87A rebate (max ₹12,500) when taxable ≤ ₹5L', () => {
    const r = svc.calculate({ annualGross: 500000, regime: 'OLD' });
    // taxable = 450,000 → 5% slab tax = 10,000 → rebate min(10000, 12500)
    expect(r.taxableIncome).toBe(450000);
    expect(r.rebate87A).toBe(10000);
    expect(r.totalTaxLiability).toBe(0);
  });

  it('compareBothRegimes recommends the lower-tax regime with savings', () => {
    const cmp = svc.compareBothRegimes({ annualGross: 1500000 });
    expect(cmp.new.totalTaxLiability).toBe(97500);
    expect(cmp.old.totalTaxLiability).toBe(257400);
    expect(cmp.recommended).toBe('NEW');
    expect(cmp.savings).toBe(159900);
  });

  it('deducts already-paid TDS from the remaining monthly amount', () => {
    const r = svc.calculate({
      annualGross: 1500000,
      regime: 'NEW',
      tdsAlreadyPaid: 40000,
      remainingMonths: 5,
    });
    // total 97,500 − 40,000 paid = 57,500 balance / 5 months = 11,500
    expect(r.balanceTax).toBe(57500);
    expect(r.monthlyTds).toBe(11500);
  });
});
