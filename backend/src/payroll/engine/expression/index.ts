// ──────────────────────────────────────────────────────────────────────────────
// Barrel export for the Paydek formula expression engine.
//
// Usage:
//   import { evaluateFormula, EvalContext } from './engine/expression';
//
//   const result = evaluateFormula(
//     'IF(GROSS <= PARAM("ESIC_LIMIT"), GROSS * PARAM("ESIC_EMP_RATE"), 0)',
//     {
//       vars: { GROSS: 25000 },
//       param: (key) => params[key],
//       earningsSum: () => totalEarnings,
//     },
//   );
// ──────────────────────────────────────────────────────────────────────────────

export type { ASTNode } from './ast';
export { tokenize } from './tokenizer';
export type { Token, TokenType } from './tokenizer';
export { parse } from './parser';
export { evaluate, FormulaError } from './evaluator';
export type { EvalContext } from './evaluator';

import { tokenize } from './tokenizer';
import { parse } from './parser';
import { evaluate } from './evaluator';
import type { EvalContext } from './evaluator';

/**
 * Convenience function: tokenize, parse, and evaluate a formula string in
 * a single call.
 *
 * @param formula  The formula expression string
 * @param context  Runtime context with variable values, parameter look-up,
 *                 and earnings aggregate
 * @returns        The numeric result of the formula evaluation
 * @throws         `FormulaError` on undefined variables, division by zero, etc.
 *                 `Error` on syntax / tokenization errors
 */
export function evaluateFormula(formula: string, context: EvalContext): number {
  const tokens = tokenize(formula);
  const ast = parse(tokens);
  return evaluate(ast, context);
}
