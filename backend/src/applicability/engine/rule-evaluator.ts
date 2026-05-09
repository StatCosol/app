/**
 * Rule Condition Evaluator – JSON DSL engine
 *
 * Condition JSON supports:
 *   { all: [ ...nodes ] }       → AND
 *   { any: [ ...nodes ] }       → OR
 *   { left, op, right? }        → leaf comparison
 *
 * Path expressions (left):
 *   unit.<key>                  → unit profile field
 *   facts.<key>                 → facts_json field
 *   act.<CODE>.enabled          → act toggle
 *   actProfile.<CODE>.<field>   → act profile data
 *
 * Comparators:
 *   EQ, NEQ, GTE, LTE, IN, EXISTS, TRUE, FALSE
 */

export type Comparator =
  | 'EQ'
  | 'NEQ'
  | 'GTE'
  | 'LTE'
  | 'IN'
  | 'EXISTS'
  | 'TRUE'
  | 'FALSE';

export type ConditionNode =
  | { all: ConditionNode[] }
  | { any: ConditionNode[] }
  | { left: string; op: Comparator; right?: unknown };

export interface EngineContext {
  unit: Record<string, unknown>;
  facts: Record<string, unknown>;
  acts: Record<string, { enabled: boolean }>;
  actProfiles: Record<string, Record<string, unknown>>;
}

function dig(obj: Record<string, unknown> | undefined, path: string): unknown {
  if (!path) return obj;
  return path
    .split('.')
    .reduce<unknown>(
      (acc, k) =>
        acc == null ? undefined : (acc as Record<string, unknown>)[k],
      obj,
    );
}

function resolveByPath(ctx: EngineContext, path: string): unknown {
  const parts = path.split('.');
  const prefix = parts[0];
  const rest = parts.slice(1);

  switch (prefix) {
    case 'unit':
      return dig(ctx.unit, rest.join('.'));

    case 'facts':
      return dig(ctx.facts, rest.join('.'));

    case 'act': {
      const actCode = rest[0];
      return dig(ctx.acts?.[actCode] ?? {}, rest.slice(1).join('.'));
    }

    case 'actProfile': {
      const actCode = rest[0];
      return dig(ctx.actProfiles?.[actCode] ?? {}, rest.slice(1).join('.'));
    }

    default:
      return undefined;
  }
}

export class RuleEvaluator {
  matches(condition: ConditionNode, ctx: EngineContext): boolean {
    if ('all' in condition) {
      return (condition as { all: ConditionNode[] }).all.every((n) =>
        this.matches(n, ctx),
      );
    }
    if ('any' in condition) {
      return (condition as { any: ConditionNode[] }).any.some((n) =>
        this.matches(n, ctx),
      );
    }

    const leaf = condition as { left: string; op: Comparator; right?: unknown };
    const leftVal = resolveByPath(ctx, leaf.left);

    switch (leaf.op) {
      case 'TRUE':
        return leftVal === true;
      case 'FALSE':
        return leftVal === false;
      case 'EXISTS':
        return leftVal !== undefined && leftVal !== null;
      case 'EQ':
        return leftVal === leaf.right;
      case 'NEQ':
        return leftVal !== leaf.right;
      case 'GTE':
        return Number(leftVal) >= Number(leaf.right);
      case 'LTE':
        return Number(leftVal) <= Number(leaf.right);
      case 'IN':
        return Array.isArray(leaf.right) ? leaf.right.includes(leftVal) : false;
      default:
        return false;
    }
  }
}
