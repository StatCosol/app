/**
 * Excel-style formulas for contractor quotation lines.
 *
 * Every vendor writes its breakup differently, so a quotation line may carry a
 * formula instead of a fixed amount or percentage. Formulas are parsed into a
 * tree and evaluated here — never handed to eval/Function — and may only use
 * numbers, earlier lines of the same quotation, the payroll variables below
 * and a fixed set of functions.
 */

/** Values supplied by the payroll run rather than by the quotation. */
export const FORMULA_VARIABLES = ['DAYS', 'WORKING_DAYS', 'OT_HOURS'] as const;
export type FormulaVariable = (typeof FORMULA_VARIABLES)[number];

export type FormulaNode =
  | { t: 'num'; v: number }
  | { t: 'ref'; name: string }
  | { t: 'neg'; a: FormulaNode }
  | { t: 'pct'; a: FormulaNode }
  | { t: 'bin'; op: string; a: FormulaNode; b: FormulaNode }
  | { t: 'call'; fn: string; args: FormulaNode[] };

const FUNCTIONS: Record<string, [number, number]> = {
  IF: [3, 3],
  MIN: [1, 50],
  MAX: [1, 50],
  SUM: [1, 50],
  ROUND: [1, 2],
  ROUNDUP: [1, 2],
  ROUNDDOWN: [1, 2],
  ABS: [1, 1],
  AND: [1, 50],
  OR: [1, 50],
  NOT: [1, 1],
  // FULL(X): line X for a full month (DAYS = WORKING_DAYS, no overtime).
  // Statutory eligibility (ESI above ₹21,000 and similar) is judged on the
  // monthly rate, not on what a short month happened to earn.
  FULL: [1, 1],
};

export const MAX_FORMULA_LENGTH = 500;
const MAX_NODES = 400;

export class FormulaError extends Error {}

type Token = { k: 'num' | 'id' | 'op'; v: string };

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const num = /^(\d+(\.\d*)?|\.\d+)/.exec(text.slice(i));
    if (num) {
      tokens.push({ k: 'num', v: num[0] });
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i));
    if (id) {
      tokens.push({ k: 'id', v: id[0].toUpperCase() });
      i += id[0].length;
      continue;
    }
    const two = text.slice(i, i + 2);
    if (['<=', '>=', '<>'].includes(two)) {
      tokens.push({ k: 'op', v: two });
      i += 2;
      continue;
    }
    if ('+-*/%(),<>='.includes(ch)) {
      tokens.push({ k: 'op', v: ch });
      i++;
      continue;
    }
    throw new FormulaError(`Unexpected character "${ch}"`);
  }
  return tokens;
}

/** Parses a formula; a leading "=" (as copied from Excel) is ignored. */
export function parseFormula(source: string): FormulaNode {
  if (typeof source !== 'string') throw new FormulaError('Formula is required');
  const text = source.trim().replace(/^=/, '').trim();
  if (!text) throw new FormulaError('Formula is required');
  if (text.length > MAX_FORMULA_LENGTH)
    throw new FormulaError(
      `Formula is longer than ${MAX_FORMULA_LENGTH} characters`,
    );
  const tokens = tokenize(text);
  let pos = 0;
  let nodes = 0;
  const node = <T extends FormulaNode>(n: T): T => {
    if (++nodes > MAX_NODES) throw new FormulaError('Formula is too complex');
    return n;
  };
  const peek = () => tokens[pos];
  const isOp = (v: string) => peek()?.k === 'op' && peek().v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new FormulaError(`Expected "${v}"`);
    pos++;
  };

  const comparison = (): FormulaNode => {
    let left = additive();
    while (
      peek()?.k === 'op' &&
      ['=', '<>', '<', '<=', '>', '>='].includes(peek().v)
    ) {
      const op = tokens[pos++].v;
      left = node({ t: 'bin', op, a: left, b: additive() });
    }
    return left;
  };
  const additive = (): FormulaNode => {
    let left = multiplicative();
    while (isOp('+') || isOp('-')) {
      const op = tokens[pos++].v;
      left = node({ t: 'bin', op, a: left, b: multiplicative() });
    }
    return left;
  };
  const multiplicative = (): FormulaNode => {
    let left = unary();
    while (isOp('*') || isOp('/')) {
      const op = tokens[pos++].v;
      left = node({ t: 'bin', op, a: left, b: unary() });
    }
    return left;
  };
  const unary = (): FormulaNode => {
    if (isOp('+')) {
      pos++;
      return unary();
    }
    if (isOp('-')) {
      pos++;
      return node({ t: 'neg', a: unary() });
    }
    let value = primary();
    while (isOp('%')) {
      pos++;
      value = node({ t: 'pct', a: value });
    }
    return value;
  };
  const primary = (): FormulaNode => {
    const token = peek();
    if (!token) throw new FormulaError('Formula ends unexpectedly');
    if (token.k === 'num') {
      pos++;
      return node({ t: 'num', v: Number(token.v) });
    }
    if (token.k === 'id') {
      pos++;
      if (!isOp('(')) return node({ t: 'ref', name: token.v });
      const arity = FUNCTIONS[token.v];
      if (!arity) throw new FormulaError(`Unknown function ${token.v}`);
      pos++;
      const args: FormulaNode[] = [];
      if (!isOp(')')) {
        args.push(comparison());
        while (isOp(',')) {
          pos++;
          args.push(comparison());
        }
      }
      expect(')');
      if (args.length < arity[0] || args.length > arity[1])
        throw new FormulaError(`Wrong number of values for ${token.v}`);
      if (token.v === 'FULL' && args[0].t !== 'ref')
        throw new FormulaError('FULL() takes a single line code');
      return node({ t: 'call', fn: token.v, args });
    }
    if (isOp('(')) {
      pos++;
      const inner = comparison();
      expect(')');
      return inner;
    }
    throw new FormulaError(`Unexpected "${token.v}"`);
  };

  const tree = comparison();
  if (pos < tokens.length)
    throw new FormulaError(`Unexpected "${tokens[pos].v}"`);
  return tree;
}

/**
 * Names a formula reads. `direct` are read as this run's amounts; `full` only
 * inside FULL(), so they carry no proration into this line.
 */
export function formulaReferences(tree: FormulaNode) {
  const direct = new Set<string>();
  const full = new Set<string>();
  const walk = (n: FormulaNode) => {
    switch (n.t) {
      case 'ref':
        direct.add(n.name);
        return;
      case 'neg':
      case 'pct':
        return walk(n.a);
      case 'bin':
        walk(n.a);
        walk(n.b);
        return;
      case 'call':
        if (n.fn === 'FULL') full.add((n.args[0] as { name: string }).name);
        else n.args.forEach(walk);
        return;
    }
  };
  walk(tree);
  return { direct, full };
}

/**
 * Excel rounding: ROUND is half away from zero, ROUNDUP away from zero and
 * ROUNDDOWN toward zero. toPrecision(15) drops binary noise first, so
 * ROUNDUP(615*26, 0) is 15990 and not 15991.
 */
export function excelRound(
  value: number,
  digits: number,
  mode: 'ROUND' | 'ROUNDUP' | 'ROUNDDOWN',
) {
  const places = Math.trunc(digits);
  const factor = 10 ** places;
  const scaled = Number((Math.abs(value) * factor).toPrecision(15));
  const whole =
    mode === 'ROUNDUP'
      ? Math.ceil(scaled)
      : mode === 'ROUNDDOWN'
        ? Math.floor(scaled)
        : Math.round(scaled);
  return (Math.sign(value) * whole) / factor;
}

export function evaluateFormula(
  tree: FormulaNode,
  scope: { value(name: string): number; full(name: string): number },
): number {
  const ev = (n: FormulaNode): number => {
    switch (n.t) {
      case 'num':
        return n.v;
      case 'ref':
        return scope.value(n.name);
      case 'neg':
        return -ev(n.a);
      case 'pct':
        return ev(n.a) / 100;
      case 'bin': {
        const a = ev(n.a),
          b = ev(n.b);
        switch (n.op) {
          case '+':
            return a + b;
          case '-':
            return a - b;
          case '*':
            return a * b;
          case '/':
            if (b === 0) throw new FormulaError('Division by zero');
            return a / b;
          case '=':
            return a === b ? 1 : 0;
          case '<>':
            return a !== b ? 1 : 0;
          case '<':
            return a < b ? 1 : 0;
          case '<=':
            return a <= b ? 1 : 0;
          case '>':
            return a > b ? 1 : 0;
          case '>=':
            return a >= b ? 1 : 0;
        }
        throw new FormulaError(`Unknown operator ${n.op}`);
      }
      case 'call': {
        if (n.fn === 'IF')
          return ev(n.args[0]) !== 0 ? ev(n.args[1]) : ev(n.args[2]);
        if (n.fn === 'FULL')
          return scope.full((n.args[0] as { name: string }).name);
        const v = n.args.map(ev);
        switch (n.fn) {
          case 'MIN':
            return Math.min(...v);
          case 'MAX':
            return Math.max(...v);
          case 'SUM':
            return v.reduce((s, x) => s + x, 0);
          case 'ABS':
            return Math.abs(v[0]);
          case 'AND':
            return v.every((x) => x !== 0) ? 1 : 0;
          case 'OR':
            return v.some((x) => x !== 0) ? 1 : 0;
          case 'NOT':
            return v[0] === 0 ? 1 : 0;
          case 'ROUND':
          case 'ROUNDUP':
          case 'ROUNDDOWN':
            return excelRound(v[0], v[1] ?? 0, n.fn);
        }
        throw new FormulaError(`Unknown function ${n.fn}`);
      }
    }
  };
  const result = ev(tree);
  if (!Number.isFinite(result))
    throw new FormulaError('Formula does not produce a number');
  return result;
}
