import { evaluateFormula, FormulaError } from './index';
import type { EvalContext } from './evaluator';

/**
 * Tests for the Paydek formula expression engine via the public
 * `evaluateFormula` entry point (exercises tokenizer + parser + evaluator).
 *
 * This is the mathematical core of payroll: a bug here silently produces
 * wrong pay, so the behaviour is pinned down explicitly.
 */

function ctx(
  vars: Record<string, number> = {},
  params: Record<string, number> = {},
  earnings = 0,
): EvalContext {
  return {
    vars,
    param: (key: string) => {
      if (!(key in params)) throw new Error(`missing test param '${key}'`);
      return params[key];
    },
    earningsSum: () => earnings,
  };
}

const evalF = (formula: string, c: EvalContext = ctx()) =>
  evaluateFormula(formula, c);

describe('payroll expression engine', () => {
  describe('arithmetic & precedence', () => {
    it('respects operator precedence (* before +)', () => {
      expect(evalF('2 + 3 * 4')).toBe(14);
    });

    it('respects parentheses', () => {
      expect(evalF('(2 + 3) * 4')).toBe(20);
    });

    it('evaluates subtraction left-to-right', () => {
      expect(evalF('10 - 2 - 3')).toBe(5);
    });

    it('evaluates division left-to-right', () => {
      expect(evalF('20 / 4 / 5')).toBe(1);
    });

    it('supports decimal literals', () => {
      expect(evalF('0.5 * 100')).toBe(50);
    });

    it('applies unary minus', () => {
      expect(evalF('-5 + 3')).toBe(-2);
      expect(evalF('2 * -3')).toBe(-6);
    });
  });

  describe('variables', () => {
    it('reads variables from context', () => {
      expect(evalF('BASIC * 0.4', ctx({ BASIC: 10000 }))).toBeCloseTo(4000, 6);
    });

    it('combines multiple variables', () => {
      expect(evalF('GROSS - BASIC', ctx({ GROSS: 25000, BASIC: 10000 }))).toBe(
        15000,
      );
    });

    it('throws FormulaError on an undefined variable', () => {
      expect(() => evalF('UNKNOWN + 1')).toThrow(FormulaError);
      expect(() => evalF('UNKNOWN + 1')).toThrow(/Undefined variable/);
    });
  });

  describe('comparisons return 1 (true) or 0 (false)', () => {
    it.each([
      ['5 < 10', 1],
      ['5 > 10', 0],
      ['5 <= 5', 1],
      ['5 >= 6', 0],
      ['5 == 5', 1],
      ['5 != 5', 0],
    ])('%s -> %d', (formula, expected) => {
      expect(evalF(formula)).toBe(expected);
    });
  });

  describe('IF()', () => {
    it('returns the true branch when the condition is non-zero', () => {
      expect(evalF('IF(1, 100, 200)')).toBe(100);
    });

    it('returns the false branch when the condition is zero', () => {
      expect(evalF('IF(0, 100, 200)')).toBe(200);
    });

    it('short-circuits: the untaken branch is NOT evaluated', () => {
      // 1/0 in the untaken branch would throw if it were evaluated.
      expect(evalF('IF(1, 5, 1 / 0)')).toBe(5);
      expect(evalF('IF(0, 1 / 0, 5)')).toBe(5);
    });
  });

  describe('MIN / MAX / ROUND', () => {
    it('MIN returns the smaller value', () => {
      expect(evalF('MIN(5, 10)')).toBe(5);
    });

    it('MAX returns the larger value', () => {
      expect(evalF('MAX(5, 10)')).toBe(10);
    });

    it('ROUND with no decimals rounds to a whole number', () => {
      expect(evalF('ROUND(3.14159)')).toBe(3);
      expect(evalF('ROUND(2.5)')).toBe(3);
    });

    it('ROUND with a decimals argument rounds to that precision', () => {
      expect(evalF('ROUND(3.14159, 2)')).toBe(3.14);
    });
  });

  describe('PARAM() and EARNINGS_SUM()', () => {
    it('looks up a parameter by string key', () => {
      expect(evalF('PARAM("PF_RATE")', ctx({}, { PF_RATE: 0.12 }))).toBe(0.12);
    });

    it('returns the running earnings aggregate', () => {
      expect(evalF('EARNINGS_SUM()', ctx({}, {}, 45000))).toBe(45000);
    });

    it('throws when PARAM is given a non-string argument', () => {
      expect(() => evalF('PARAM(5)')).toThrow(FormulaError);
    });
  });

  describe('realistic statutory formulas', () => {
    it('ESIC: employee share when gross is within the wage limit', () => {
      const result = evalF(
        'IF(GROSS <= PARAM("ESIC_LIMIT"), GROSS * PARAM("ESIC_EMP_RATE"), 0)',
        ctx({ GROSS: 20000 }, { ESIC_LIMIT: 21000, ESIC_EMP_RATE: 0.0075 }),
      );
      expect(result).toBeCloseTo(150, 6);
    });

    it('ESIC: zero when gross exceeds the wage limit', () => {
      const result = evalF(
        'IF(GROSS <= PARAM("ESIC_LIMIT"), GROSS * PARAM("ESIC_EMP_RATE"), 0)',
        ctx({ GROSS: 25000 }, { ESIC_LIMIT: 21000, ESIC_EMP_RATE: 0.0075 }),
      );
      expect(result).toBe(0);
    });

    it('PF: contribution on wage capped at the PF ceiling', () => {
      const result = evalF(
        'MIN(PF_WAGE, PARAM("PF_CAP")) * PARAM("PF_RATE")',
        ctx({ PF_WAGE: 20000 }, { PF_CAP: 15000, PF_RATE: 0.12 }),
      );
      expect(result).toBeCloseTo(1800, 6);
    });
  });

  describe('error handling', () => {
    it('throws FormulaError on division by zero', () => {
      expect(() => evalF('5 / 0')).toThrow(FormulaError);
      expect(() => evalF('5 / 0')).toThrow(/Division by zero/);
    });

    it('rejects an unknown function at parse time (built-in allow-list)', () => {
      // The parser validates function names against a built-in allow-list, so
      // an unknown name is rejected during parsing rather than evaluation.
      expect(() => evalF('FOO(1)')).toThrow(/Unknown function/);
    });

    it('throws when a string literal is used as a numeric value', () => {
      expect(() => evalF('"abc"')).toThrow(FormulaError);
    });

    it('throws on an unexpected character (tokenizer error)', () => {
      expect(() => evalF('2 @ 3')).toThrow(/Unexpected character/);
    });

    it('throws on an unterminated string literal', () => {
      expect(() => evalF('PARAM("abc)')).toThrow(/Unterminated string/);
    });
  });
});
