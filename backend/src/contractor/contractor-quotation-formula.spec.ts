import {
  evaluateFormula,
  excelRound,
  formulaReferences,
  parseFormula,
} from './contractor-quotation-formula';

const calc = (formula: string, values: Record<string, number> = {}) =>
  evaluateFormula(parseFormula(formula), {
    value: (name) => values[name],
    full: (name) => values['FULL_' + name],
  });

describe('quotation formulas', () => {
  it('follows Excel precedence, percentages and a leading "="', () => {
    expect(calc('=(B + L) * 8.33%', { B: 15002, L: 865.5 })).toBeCloseTo(
      1321.76275,
      6,
    );
    expect(calc('2 + 3 * 4')).toBe(14);
    expect(calc('-2 * 3 + 10 / 4')).toBe(-3.5);
    expect(calc('5/12')).toBeCloseTo(0.41667, 5);
  });

  it('supports the functions vendors use', () => {
    expect(calc('ROUND(IF(B <= 15000, B * 13%, 1950), 0)', { B: 16000 })).toBe(
      1950,
    );
    expect(calc('IF(D >= 21000, 1221, D * 3.25%)', { D: 15000 })).toBe(487.5);
    expect(calc('MAX(D, 7000) * 8.33%', { D: 5000 })).toBeCloseTo(583.1, 6);
    expect(calc('SUM(1, 2, 3) + MIN(4, 5) + ABS(-1)')).toBe(11);
    expect(calc('AND(1, 0) + OR(1, 0) + NOT(0)')).toBe(2);
    expect(calc('ROUNDUP(615 * 26, 0)')).toBe(15990);
    expect(calc('ROUNDUP(12.01, 0) + ROUNDDOWN(12.99, 0)')).toBe(25);
    expect(calc('1 <> 2')).toBe(1);
  });

  it('reads FULL() separately from this run', () => {
    expect(
      calc('IF(FULL(G) > 21000, 0, G * 0.75%)', { G: 11000, FULL_G: 22000 }),
    ).toBe(0);
    const refs = formulaReferences(parseFormula('A + FULL(B) * DAYS'));
    expect([...refs.direct].sort()).toEqual(['A', 'DAYS']);
    expect([...refs.full]).toEqual(['B']);
  });

  it('rounds half away from zero without float noise', () => {
    expect(excelRound(2.675, 2, 'ROUND')).toBe(2.68);
    expect(excelRound(-2.5, 0, 'ROUND')).toBe(-3);
    expect(excelRound(-2.1, 0, 'ROUNDUP')).toBe(-3);
  });

  it('rejects anything outside the formula language', () => {
    for (const bad of [
      '',
      'B +',
      'process.exit()',
      'EVAL(1)',
      'B; 1',
      'IF(1, 2)',
      'FULL(A + B)',
      '"text"',
      'B[0]',
      'x'.repeat(501),
    ])
      expect(() => parseFormula(bad)).toThrow();
    expect(() => calc('1 / (B - B)', { B: 4 })).toThrow('Division by zero');
  });
});
