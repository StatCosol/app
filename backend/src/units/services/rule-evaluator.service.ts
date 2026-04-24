import { Injectable, BadRequestException } from '@nestjs/common';
import { ThresholdResolverService } from '../../masters/services/threshold-resolver.service';

type FactOp =
  | '=='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'in'
  | 'not_in'
  | 'exists';

interface ConditionItem {
  fact: string;
  op: FactOp;
  value?: unknown;
  threshold?: string;
}

interface ConditionsJson {
  all?: ConditionItem[];
  any?: ConditionItem[];
}

@Injectable()
export class RuleEvaluatorService {
  constructor(private readonly thresholds: ThresholdResolverService) {}

  async matches(
    conditions: ConditionsJson,
    facts: Record<string, unknown>,
    stateCode: string,
    onDate?: string,
  ): Promise<boolean> {
    const all = conditions?.all ?? [];
    const any = conditions?.any ?? [];

    const allOk = await this.evalList(all, facts, stateCode, onDate, 'ALL');
    if (!allOk) return false;

    const anyOk =
      any.length === 0
        ? true
        : await this.evalList(any, facts, stateCode, onDate, 'ANY');

    return anyOk;
  }

  private async evalList(
    items: ConditionItem[],
    facts: Record<string, unknown>,
    stateCode: string,
    onDate: string | undefined,
    mode: 'ALL' | 'ANY',
  ): Promise<boolean> {
    if (items.length === 0) return true;

    for (const item of items) {
      const ok = await this.evalItem(item, facts, stateCode, onDate);
      if (mode === 'ALL' && !ok) return false;
      if (mode === 'ANY' && ok) return true;
    }
    return mode === 'ALL';
  }

  private async evalItem(
    item: ConditionItem,
    facts: Record<string, any>,
    stateCode: string,
    onDate?: string,
  ): Promise<boolean> {
    const factVal = facts[item.fact];

    if (item.op === 'exists') return factVal !== undefined && factVal !== null;

    let rhs: unknown = item.value;
    if (item.threshold) {
      try {
        rhs = await this.thresholds.getNumber(
          item.threshold,
          stateCode,
          onDate,
        );
      } catch {
        // Threshold not found — condition cannot be satisfied
        return false;
      }
    }

    switch (item.op) {
      case '==':
        return factVal === rhs;
      case '!=':
        return factVal !== rhs;
      case '>':
        return Number(factVal) > Number(rhs);
      case '>=':
        return Number(factVal) >= Number(rhs);
      case '<':
        return Number(factVal) < Number(rhs);
      case '<=':
        return Number(factVal) <= Number(rhs);
      case 'in': {
        if (!Array.isArray(rhs)) {
          throw new BadRequestException(
            `Rule value must be array for 'in' op (fact=${item.fact})`,
          );
        }
        return rhs.includes(factVal);
      }
      case 'not_in': {
        if (!Array.isArray(rhs)) {
          throw new BadRequestException(
            `Rule value must be array for 'not_in' op (fact=${item.fact})`,
          );
        }
        return !rhs.includes(factVal);
      }
      default:
        throw new BadRequestException('Unknown op');
    }
  }
}
