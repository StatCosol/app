import {
  GratuityCalculatorService,
  GratuityInput,
} from './gratuity-calculator.service';

/**
 * Gratuity Calculator tests — Payment of Gratuity Act, 1972.
 * Formula: (15 × last drawn salary × years) / 26, min 5 years, capped at ₹25L.
 */
describe('GratuityCalculatorService', () => {
  let svc: GratuityCalculatorService;
  const calc = (input: GratuityInput) => svc.calculate(input);

  beforeEach(() => {
    svc = new GratuityCalculatorService();
  });

  it('computes gratuity for an eligible employee', () => {
    const r = calc({ lastDrawnSalary: 50000, yearsOfService: 10 });
    expect(r.eligible).toBe(true);
    expect(r.yearsConsidered).toBe(10);
    // (15 × 50000 × 10) / 26 = 288461.538...
    expect(r.grossGratuity).toBeCloseTo(288461.54, 2);
    expect(r.cappedGratuity).toBeCloseTo(288461.54, 2);
  });

  it('rounds a partial year of ≥ 6 months up (making 4y6m eligible)', () => {
    const r = calc({
      lastDrawnSalary: 50000,
      yearsOfService: 4,
      monthsOfService: 6,
    });
    expect(r.eligible).toBe(true);
    expect(r.yearsConsidered).toBe(5);
    // (15 × 50000 × 5) / 26 = 144230.769...
    expect(r.grossGratuity).toBeCloseTo(144230.77, 2);
  });

  it('does NOT round up a partial year of < 6 months', () => {
    const r = calc({
      lastDrawnSalary: 50000,
      yearsOfService: 4,
      monthsOfService: 5,
    });
    expect(r.eligible).toBe(false);
    expect(r.yearsConsidered).toBe(4);
    expect(r.reason).toMatch(/5 years/);
    expect(r.grossGratuity).toBe(0);
    expect(r.cappedGratuity).toBe(0);
  });

  it('is ineligible below 5 years of service', () => {
    const r = calc({ lastDrawnSalary: 50000, yearsOfService: 3 });
    expect(r.eligible).toBe(false);
    expect(r.grossGratuity).toBe(0);
  });

  it('waives the 5-year minimum on death or disability', () => {
    const r = calc({
      lastDrawnSalary: 50000,
      yearsOfService: 3,
      isDeathOrDisability: true,
    });
    expect(r.eligible).toBe(true);
    // (15 × 50000 × 3) / 26 = 86538.46...
    expect(r.grossGratuity).toBeCloseTo(86538.46, 2);
  });

  it('caps gratuity at ₹25,00,000', () => {
    const r = calc({ lastDrawnSalary: 1000000, yearsOfService: 30 });
    expect(r.eligible).toBe(true);
    // Gross = (15 × 1000000 × 30) / 26 = 17,307,692.31 → capped to 25L
    expect(r.grossGratuity).toBeCloseTo(17307692.31, 2);
    expect(r.cappedGratuity).toBe(2500000);
  });
});
