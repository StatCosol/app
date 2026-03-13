import { ComplianceSource } from '../entities/enums';

/**
 * Source precedence: MANUAL_OVERRIDE > AUTO_RULE > PACKAGE > ACT_TOGGLE
 */
const SOURCE_RANK: Record<ComplianceSource, number> = {
  [ComplianceSource.MANUAL_OVERRIDE]: 4,
  [ComplianceSource.AUTO_RULE]: 3,
  [ComplianceSource.PACKAGE]: 2,
  [ComplianceSource.ACT_TOGGLE]: 1,
};

export function strongerSource(
  a: ComplianceSource,
  b: ComplianceSource,
): ComplianceSource {
  return SOURCE_RANK[a] >= SOURCE_RANK[b] ? a : b;
}

export function mergeExplain(
  base: Record<string, any>,
  add: Record<string, any>,
): Record<string, any> {
  const rules = [
    ...((base?.rules as string[]) ?? []),
    ...((add?.rules as string[]) ?? []),
  ];
  const packages = [
    ...((base?.packages as string[]) ?? []),
    ...((add?.packages as string[]) ?? []),
  ];
  return {
    ...base,
    ...add,
    ...(rules.length ? { rules } : {}),
    ...(packages.length ? { packages } : {}),
  };
}
