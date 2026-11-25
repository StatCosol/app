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
  const months = assignmentType === 'CRM' ? 12 : 4;
  const target = d.getUTCMonth() + months;
  const year = d.getUTCFullYear() + Math.floor(target / 12);
  const month = target % 12;
  // Clamp to the last day of the due month: 31 Oct + 4 months is 28/29 Feb,
  // not 3 March (and 29 Feb + 12 months is 28 Feb).
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const due = new Date(
    Date.UTC(year, month, Math.min(d.getUTCDate(), lastDay)),
  );

  return due.toISOString().slice(0, 10); // YYYY-MM-DD
}
