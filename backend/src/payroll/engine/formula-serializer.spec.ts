import { serializeFormula, FormulaNode } from './formula-serializer';
import { evaluateFormula } from './expression';
import type { EvalContext } from './expression/evaluator';

/**
 * Formula serializer tests — the no-code Builder's JSON tree is serialized to
 * the engine's text grammar. Besides checking each node's output, the
 * round-trip tests confirm the serialized text actually evaluates correctly
 * through evaluateFormula(), tying the Builder to the engine.
 */

const ctx = (vars: Record<string, number> = {}): EvalContext => ({
  vars,
  param: (k) => {
    throw new Error(`unexpected PARAM(${k})`);
  },
  earningsSum: () => 0,
});

describe('serializeFormula', () => {
  it('serializes FIXED and VARIABLE nodes', () => {
    expect(serializeFormula({ type: 'FIXED', value: 100 })).toBe('100');
    expect(serializeFormula({ type: 'VARIABLE', name: 'BASIC' })).toBe('BASIC');
  });

  it('serializes PERCENT as (base * value / 100)', () => {
    expect(
      serializeFormula({ type: 'PERCENT', base: 'BASIC', value: 40 }),
    ).toBe('(BASIC * 40 / 100)');
  });

  it('serializes OP with parentheses', () => {
    expect(
      serializeFormula({
        type: 'OP',
        op: '+',
        left: { type: 'FIXED', value: 1 },
        right: { type: 'FIXED', value: 2 },
      }),
    ).toBe('(1 + 2)');
  });

  it('serializes MAX / MIN with comma-separated args', () => {
    const values: FormulaNode[] = [
      { type: 'VARIABLE', name: 'MIN_WAGE' },
      { type: 'VARIABLE', name: 'BASIC' },
    ];
    expect(serializeFormula({ type: 'MAX', values })).toBe(
      'MAX(MIN_WAGE, BASIC)',
    );
    expect(serializeFormula({ type: 'MIN', values })).toBe(
      'MIN(MIN_WAGE, BASIC)',
    );
  });

  it('serializes BALANCE as total minus each subtract term', () => {
    expect(
      serializeFormula({
        type: 'BALANCE',
        total: 'GROSS',
        subtract: ['BASIC', 'HRA'],
      }),
    ).toBe('(GROSS - BASIC - HRA)');
  });

  it('serializes IF with a comparison condition', () => {
    expect(
      serializeFormula({
        type: 'IF',
        condition: {
          left: { type: 'VARIABLE', name: 'GROSS' },
          op: '<=',
          right: { type: 'FIXED', value: 21000 },
        },
        then: { type: 'FIXED', value: 1 },
        else: { type: 'FIXED', value: 0 },
      }),
    ).toBe('IF(GROSS <= 21000, 1, 0)');
  });

  it('serializes RAW verbatim (trimmed)', () => {
    expect(serializeFormula({ type: 'RAW', expr: '  BASIC * 0.5  ' })).toBe(
      'BASIC * 0.5',
    );
  });

  describe('round-trips through evaluateFormula()', () => {
    it('PERCENT of a variable', () => {
      const text = serializeFormula({
        type: 'PERCENT',
        base: 'BASIC',
        value: 40,
      });
      expect(evaluateFormula(text, ctx({ BASIC: 10000 }))).toBeCloseTo(4000, 6);
    });

    it('BALANCE of gross minus components', () => {
      const text = serializeFormula({
        type: 'BALANCE',
        total: 'GROSS',
        subtract: ['BASIC', 'HRA'],
      });
      expect(
        evaluateFormula(text, ctx({ GROSS: 30000, BASIC: 12000, HRA: 8000 })),
      ).toBe(10000);
    });

    it('MAX(MIN_WAGE, BASIC)', () => {
      const text = serializeFormula({
        type: 'MAX',
        values: [
          { type: 'VARIABLE', name: 'MIN_WAGE' },
          { type: 'VARIABLE', name: 'BASIC' },
        ],
      });
      expect(
        evaluateFormula(text, ctx({ MIN_WAGE: 15000, BASIC: 12000 })),
      ).toBe(15000);
    });

    it('IF selects the correct branch', () => {
      const text = serializeFormula({
        type: 'IF',
        condition: {
          left: { type: 'VARIABLE', name: 'GROSS' },
          op: '<=',
          right: { type: 'FIXED', value: 21000 },
        },
        then: { type: 'FIXED', value: 100 },
        else: { type: 'FIXED', value: 0 },
      });
      expect(evaluateFormula(text, ctx({ GROSS: 20000 }))).toBe(100);
      expect(evaluateFormula(text, ctx({ GROSS: 25000 }))).toBe(0);
    });
  });

  describe('validation errors', () => {
    it('rejects an empty tree', () => {
      expect(() => serializeFormula(null)).toThrow(/empty/);
    });

    it('rejects a non-UPPER_SNAKE variable name', () => {
      expect(() =>
        serializeFormula({ type: 'VARIABLE', name: 'basic' }),
      ).toThrow(/UPPER_SNAKE/);
    });

    it('rejects a non-numeric FIXED value', () => {
      expect(() => serializeFormula({ type: 'FIXED', value: NaN })).toThrow(
        /must be a number/,
      );
    });

    it('rejects MAX with fewer than 2 values', () => {
      expect(() =>
        serializeFormula({
          type: 'MAX',
          values: [{ type: 'VARIABLE', name: 'BASIC' }],
        }),
      ).toThrow(/at least 2/);
    });

    it('rejects BALANCE with an empty subtract list', () => {
      expect(() =>
        serializeFormula({ type: 'BALANCE', total: 'GROSS', subtract: [] }),
      ).toThrow(/non-empty/);
    });

    it('rejects an unknown node type', () => {
      expect(() =>
        serializeFormula({ type: 'BOGUS' } as unknown as FormulaNode),
      ).toThrow(/Unknown formula node type/);
    });
  });
});
