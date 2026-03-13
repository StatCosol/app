// ──────────────────────────────────────────────────────────────────────────────
// AST evaluator for the Paydek formula expression language.
//
// Walks a parsed AST and produces a numeric result given a runtime context
// that supplies variable values, parameter look-ups, and the EARNINGS_SUM
// aggregate.
// ──────────────────────────────────────────────────────────────────────────────

import { ASTNode } from './ast';

/**
 * Runtime context supplied to the evaluator by the payroll calculation engine.
 *
 * - `vars`        : pre-computed component values keyed by component code
 *                   (e.g. BASIC, HRA, GROSS, PF_WAGE).
 * - `param`       : retrieves a numeric rule-set parameter by key
 *                   (e.g. PARAM("PF_EMP_RATE")).
 * - `earningsSum` : returns the sum of all EARNING-type component values
 *                   calculated so far in the current run.
 */
export interface EvalContext {
  vars: Record<string, number>;
  param: (key: string) => number;
  earningsSum: () => number;
}

/**
 * Typed error thrown when formula evaluation fails at runtime.
 */
export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaError';
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function isTruthy(value: number): boolean {
  // In formula land, 0 is falsy, anything else is truthy.
  return value !== 0;
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluate an AST node tree against the supplied context and return a
 * numeric result.
 *
 * Throws `FormulaError` if:
 *  - A referenced variable does not exist in the context
 *  - Division by zero is attempted
 *  - A string value appears where a number is expected (outside PARAM args)
 */
export function evaluate(node: ASTNode, ctx: EvalContext): number {
  switch (node.type) {
    // ── Literals ──────────────────────────────────────────────────────
    case 'number':
      return node.value;

    case 'string':
      // String literals should only appear as PARAM() arguments.
      // If one leaks to top-level evaluation we treat it as an error.
      throw new FormulaError(
        `String literal "${node.value}" cannot be used as a numeric value`,
      );

    // ── Variable reference ────────────────────────────────────────────
    case 'variable': {
      const val = ctx.vars[node.name];
      if (val === undefined) {
        throw new FormulaError(
          `Undefined variable '${node.name}' — ensure the component is calculated before this formula`,
        );
      }
      return val;
    }

    // ── Binary arithmetic ─────────────────────────────────────────────
    case 'binary': {
      const left = evaluate(node.left, ctx);
      const right = evaluate(node.right, ctx);

      switch (node.op) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          if (right === 0) {
            throw new FormulaError('Division by zero');
          }
          return left / right;
      }
      // Exhaustive — all four operators are covered above.
      // This line is unreachable but satisfies the return type.
      throw new FormulaError(`Unknown binary operator`);
    }

    // ── Unary minus ───────────────────────────────────────────────────
    case 'unary':
      return -evaluate(node.operand, ctx);

    // ── Comparison → returns 1 (true) or 0 (false) ───────────────────
    case 'comparison': {
      const left = evaluate(node.left, ctx);
      const right = evaluate(node.right, ctx);

      switch (node.op) {
        case '<':
          return left < right ? 1 : 0;
        case '<=':
          return left <= right ? 1 : 0;
        case '>':
          return left > right ? 1 : 0;
        case '>=':
          return left >= right ? 1 : 0;
        case '==':
          return left === right ? 1 : 0;
        case '!=':
          return left !== right ? 1 : 0;
      }
      // Exhaustive — all six operators are covered above.
      throw new FormulaError(`Unknown comparison operator`);
    }

    // ── Function calls ────────────────────────────────────────────────
    case 'function':
      return evaluateFunction(node.name, node.args, ctx);

    default:
      throw new FormulaError(
        `Unknown AST node type '${(node as ASTNode).type}'`,
      );
  }
}

// ── Built-in function dispatch ────────────────────────────────────────────────

function evaluateFunction(
  name: string,
  args: ASTNode[],
  ctx: EvalContext,
): number {
  switch (name) {
    // IF(condition, trueValue, falseValue)
    case 'IF': {
      const condition = evaluate(args[0], ctx);
      // Short-circuit: only evaluate the branch we need.
      return isTruthy(condition)
        ? evaluate(args[1], ctx)
        : evaluate(args[2], ctx);
    }

    // MIN(a, b)
    case 'MIN':
      return Math.min(evaluate(args[0], ctx), evaluate(args[1], ctx));

    // MAX(a, b)
    case 'MAX':
      return Math.max(evaluate(args[0], ctx), evaluate(args[1], ctx));

    // ROUND(value)  or  ROUND(value, decimals)
    case 'ROUND': {
      const value = evaluate(args[0], ctx);
      const decimals = args.length > 1 ? evaluate(args[1], ctx) : 0;
      return roundTo(value, decimals);
    }

    // PARAM("key") – looks up a rule-set parameter by its string key
    case 'PARAM': {
      const keyNode = args[0];
      if (keyNode.type !== 'string') {
        throw new FormulaError(
          `PARAM() expects a string argument but got ${keyNode.type}`,
        );
      }
      return ctx.param(keyNode.value);
    }

    // EARNINGS_SUM() – aggregate of all earning components so far
    case 'EARNINGS_SUM':
      return ctx.earningsSum();

    default:
      throw new FormulaError(`Unknown function '${name}'`);
  }
}
