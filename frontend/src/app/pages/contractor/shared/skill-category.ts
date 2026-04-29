/**
 * Statutory skill categories used for contractor-deployed workers
 * (Minimum Wages Act / state wage notifications).
 *
 * Phase 0: display-only constants. Phase 1 will wire these into the
 * contractor employee schema, bulk-upload validator and minimum-wage check.
 */
export type SkillCategory =
  | 'UNSKILLED'
  | 'SEMI_SKILLED'
  | 'SKILLED'
  | 'HIGHLY_SKILLED';

export interface SkillCategoryOption {
  value: SkillCategory;
  label: string;
}

export const SKILL_CATEGORIES: ReadonlyArray<SkillCategoryOption> = [
  { value: 'UNSKILLED', label: 'Unskilled' },
  { value: 'SEMI_SKILLED', label: 'Semi Skilled' },
  { value: 'SKILLED', label: 'Skilled' },
  { value: 'HIGHLY_SKILLED', label: 'Highly Skilled' },
] as const;

export function skillCategoryLabel(value: string | null | undefined): string {
  if (!value) return '';
  const match = SKILL_CATEGORIES.find((s) => s.value === value);
  return match?.label ?? value;
}
