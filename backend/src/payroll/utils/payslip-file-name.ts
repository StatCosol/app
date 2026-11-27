import { createHash } from 'crypto';

/** Keep display codes inside the PDF; disk/ZIP names must be single safe segments. */
export function payslipFileName(
  year: number,
  month: number,
  employeeCode: string,
  runEmployeeId: string,
): string {
  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 9999 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new Error('Invalid payslip period');
  }
  const code = String(employeeCode ?? '');
  const label = code.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'employee';
  // Sanitisation, truncation and case-insensitive disks must not merge two workers.
  const suffix = createHash('sha256')
    .update(JSON.stringify([runEmployeeId, code]))
    .digest('hex')
    .slice(0, 32);
  return `payslip_${year}_${String(month).padStart(2, '0')}_${label}_${suffix}.pdf`;
}
