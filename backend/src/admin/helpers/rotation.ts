/**
 * Calculate rotation due date based on assignment type
 *
 * Rules:
 * - CRM: 12 months from effective date
 * - AUDITOR: 4 months from effective date
 *
 * @param assignmentType - 'CRM' or 'AUDITOR'
 * @param effectiveDateISO - Effective date in YYYY-MM-DD format
 * @returns Due date in YYYY-MM-DD format
 */
export function calcRotationDueOn(
  assignmentType: 'CRM' | 'AUDITOR',
  effectiveDateISO: string,
): string {
  const d = new Date(effectiveDateISO + 'T00:00:00Z');
  const due = new Date(d);

  if (assignmentType === 'CRM') {
    due.setUTCFullYear(due.getUTCFullYear() + 1); // 12 months
  } else {
    due.setUTCMonth(due.getUTCMonth() + 4); // 4 months
  }

  return due.toISOString().slice(0, 10); // YYYY-MM-DD
}
