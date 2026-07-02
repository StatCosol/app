/**
 * Visual Formula Builder — JSON tree → text expression serializer.
 *
 * The payroll engine evaluates plain text formulas via `evaluateFormula()`.
 * The no-code Builder UI authors structured JSON which we serialize to that
 * same text grammar so the engine needs no changes.
 *
 * Supported node types:
 *   { type: 'FIXED',    value: number }
 *   { type: 'VARIABLE', name: string }                         // e.g. BASIC, GROSS, MIN_WAGE
 *   { type: 'PERCENT',  base: string, value: number }          // value % of base
 *   { type: 'OP',       op: '+'|'-'|'*'|'/', left, right }
 *   { type: 'MAX',      values: Node[] }                       // "Greater Of"
 *   { type: 'MIN',      values: Node[] }                       // "Lower Of"
 *   { type: 'BALANCE',  total: string, subtract: string[] }    // total - sum(subtract)
 *   { type: 'IF',       condition: { left, op, right }, then, else }
 *   { type: 'RAW',      expr: string }                         // escape hatch
 */

export type FormulaNode =
  | { type: 'FIXED'; value: number }
  | { type: 'VARIABLE'; name: string }
  | { type: 'PERCENT'; base: string; value: number }
  | {
      type: 'OP';
      op: '+' | '-' | '*' | '/';
      left: FormulaNode;
      right: FormulaNode;
    }
  | { type: 'MAX'; values: FormulaNode[] }
  | { type: 'MIN'; values: FormulaNode[] }
  | { type: 'BALANCE'; total: string; subtract: string[] }
  | {
      type: 'IF';
      condition: {
        left: FormulaNode;
        op: '>' | '<' | '>=' | '<=' | '==' | '!=';
        right: FormulaNode;
      };
      then: FormulaNode;
      else: FormulaNode;
    }
  | { type: 'RAW'; expr: string };

const VAR_NAME = /^[A-Z_][A-Z0-9_]*$/;

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function ensureVarName(name: unknown, label: string): string {
  if (typeof name !== 'string' || !VAR_NAME.test(name)) {
    throw new Error(
      `${label} must be UPPER_SNAKE variable name; got: ${String(name)}`,
    );
  }
  return name;
}

/**
 * Serialize a structured FormulaNode tree to a parenthesized text
 * expression compatible with the engine's `evaluateFormula()`.
 */
export function serializeFormula(node: FormulaNode | null | undefined): string {
  if (!node) throw new Error('Formula JSON is empty');
  switch (node.type) {
    case 'FIXED':
      if (!isFiniteNumber(node.value))
        throw new Error('FIXED.value must be a number');
      return String(node.value);

    case 'VARIABLE':
      return ensureVarName(node.name, 'VARIABLE.name');

    case 'PERCENT': {
      const base = ensureVarName(node.base, 'PERCENT.base');
      if (!isFiniteNumber(node.value))
        throw new Error('PERCENT.value must be a number');
      return `(${base} * ${node.value} / 100)`;
    }

    case 'OP': {
      if (!['+', '-', '*', '/'].includes(node.op)) {
        throw new Error(`OP.op must be one of + - * /, got: ${node.op}`);
      }
      return `(${serializeFormula(node.left)} ${node.op} ${serializeFormula(node.right)})`;
    }

    case 'MAX':
    case 'MIN': {
      if (!Array.isArray(node.values) || node.values.length < 2) {
        throw new Error(`${node.type} requires at least 2 values`);
      }
      return `${node.type}(${node.values.map(serializeFormula).join(', ')})`;
    }

    case 'BALANCE': {
      const total = ensureVarName(node.total, 'BALANCE.total');
      if (!Array.isArray(node.subtract) || node.subtract.length === 0) {
        throw new Error(
          'BALANCE.subtract must be a non-empty array of variable names',
        );
      }
      const parts = node.subtract.map((v) =>
        ensureVarName(v, 'BALANCE.subtract item'),
      );
      return `(${total} - ${parts.join(' - ')})`;
    }

    case 'IF': {
      const c = node.condition;
      if (!c) throw new Error('IF.condition is required');
      if (!['>', '<', '>=', '<=', '==', '!='].includes(c.op)) {
        throw new Error(`IF.condition.op must be a comparison, got: ${c.op}`);
      }
      const left = serializeFormula(c.left);
      const right = serializeFormula(c.right);
      const thenE = serializeFormula(node.then);
      const elseE = serializeFormula(node.else);
      return `IF(${left} ${c.op} ${right}, ${thenE}, ${elseE})`;
    }

    case 'RAW': {
      if (typeof node.expr !== 'string' || !node.expr.trim()) {
        throw new Error('RAW.expr must be a non-empty string');
      }
      return node.expr.trim();
    }

    default: {
      const t = (node as { type?: unknown }).type;
      throw new Error(`Unknown formula node type: ${String(t)}`);
    }
  }
}
