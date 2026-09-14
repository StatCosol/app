import { BadRequestException } from '@nestjs/common';

/** Central OSH section 32. Inputs are verified annual totals, not monthly policy accruals. */
export interface StatutoryLeaveInput {
  year: number;
  standardSection32Confirmed: boolean;
  joiningDate: string;
  exitDate?: string;
  category: 'ADULT' | 'ADOLESCENT' | 'UNDERGROUND_MINE';
  workedDays: number;
  layoffDays: number;
  maternityDays: number;
  annualLeaveDays: number;
  awardedDays: number;
  openingOrdinary: number;
  openingRefused: number;
  usedOrdinary: number;
  usedRefused: number;
  encashedOrdinary: number;
  encashedRefused: number;
  refusedThisYear: number;
  evidenceReference: string;
}
export function statutoryLeaveCalculation(input: StatutoryLeaveInput) {
  const errors: string[] = [];
  if (!input || typeof input !== 'object')
    throw new BadRequestException('Enter verified annual leave totals');
  if (input.standardSection32Confirmed !== true)
    errors.push(
      'Confirm standard section 32 applies; use the separately verified scheme for special categories or exemptions',
    );
  const date = (s: unknown) =>
    typeof s === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  if (!Number.isInteger(input.year) || input.year < 2026 || input.year > 2100)
    errors.push('Select a supported calendar year');
  if (!date(input.joiningDate) || input.joiningDate > `${input.year}-12-31`)
    errors.push('Enter the actual joining date');
  if (
    input.exitDate &&
    (!date(input.exitDate) ||
      input.exitDate < input.joiningDate ||
      !input.exitDate.startsWith(input.year + '-'))
  )
    errors.push('Exit date must be in this year and after joining');
  if (!['ADULT', 'ADOLESCENT', 'UNDERGROUND_MINE'].includes(input.category))
    errors.push('Select the worker category');
  const keys = [
    'workedDays',
    'layoffDays',
    'maternityDays',
    'annualLeaveDays',
    'awardedDays',
    'openingOrdinary',
    'openingRefused',
    'usedOrdinary',
    'usedRefused',
    'encashedOrdinary',
    'encashedRefused',
    'refusedThisYear',
  ] as const;
  for (const key of keys)
    if (
      typeof input[key] !== 'number' ||
      !Number.isFinite(input[key]) ||
      input[key] < 0 ||
      input[key] > 10000 ||
      Math.abs(input[key] * 100 - Math.round(input[key] * 100)) > 0.000001
    )
      errors.push(
        key + ' must be a non-negative number with at most two decimals',
      );
  if (
    typeof input.evidenceReference !== 'string' ||
    input.evidenceReference.trim().length < 3 ||
    input.evidenceReference.length > 300
  )
    errors.push('An attendance/leave-ledger evidence reference is required');
  if (errors.length)
    throw new BadRequestException({
      message: 'Complete statutory leave inputs',
      errors,
    });
  const start =
    input.joiningDate > `${input.year}-01-01`
      ? input.joiningDate
      : `${input.year}-01-01`;
  const end = input.exitDate || `${input.year}-12-31`;
  const days = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  const qualifyingDays =
    input.workedDays +
    input.layoffDays +
    input.maternityDays +
    input.annualLeaveDays;
  if (qualifyingDays > days)
    throw new BadRequestException(
      'Worked and qualifying non-working days cannot overlap or exceed the employment period',
    );
  const midYear = input.joiningDate > `${input.year}-01-01`;
  const remainingYearDays =
    (Date.parse(`${input.year}-12-31`) - Date.parse(start)) / 86400000 + 1;
  // Mid-year clause uses actual work, not deemed qualifying leave. Exit entitlement is assessed even below the threshold.
  const qualifies =
    !!input.exitDate ||
    (midYear
      ? input.workedDays >= remainingYearDays / 4
      : qualifyingDays >= 180);
  const divisor = input.category === 'ADULT' ? 20 : 15;
  const minimum = qualifies ? input.workedDays / divisor : 0;
  if (input.awardedDays + 0.000001 < minimum)
    throw new BadRequestException(
      'Awarded leave cannot be below the statutory earned amount. Apply the verified rounding or more-beneficial agreement and enter the awarded days.',
    );
  const cents = (v: number) => Math.round(v * 100);
  const ordinary =
    cents(input.openingOrdinary) +
    cents(input.awardedDays) -
    cents(input.usedOrdinary) -
    cents(input.encashedOrdinary) -
    cents(input.refusedThisYear);
  const protectedBalance =
    cents(input.openingRefused) +
    cents(input.refusedThisYear) -
    cents(input.usedRefused) -
    cents(input.encashedRefused);
  if (ordinary < 0 || protectedBalance < 0)
    throw new BadRequestException(
      'Leave used, encashed or moved to refused leave exceeds the corresponding available balance',
    );
  const carryOrdinary = input.exitDate ? 0 : Math.min(ordinary, 3000) / 100;
  const carryRefused = input.exitDate ? 0 : protectedBalance / 100;
  return {
    basis: 'OSH Code 2020, section 32; Central OSH Rules 2026, Rule 76',
    sourceUrl:
      'https://labour.maharashtra.gov.in/sites/default/files/2026-04/the-occupational-safety-health-and-working-conditions-code-2020.pdf',
    qualifies,
    qualifyingDays,
    workedDays: input.workedDays,
    divisor,
    minimumEarnedFraction: `${qualifies ? input.workedDays : 0}/${divisor}`,
    minimumEarnedDays: Number(minimum.toFixed(6)),
    awardedDays: input.awardedDays,
    ordinaryClosing: ordinary / 100,
    refusedClosing: protectedBalance / 100,
    carryOrdinary,
    carryRefused,
    carryForward: carryOrdinary + carryRefused,
    encashableExcess: input.exitDate
      ? (ordinary + protectedBalance) / 100
      : Math.max(ordinary - 3000, 0) / 100,
    note: 'Verified annual totals only. Non-working qualifying days do not earn leave. Refused leave is retained separately without the ordinary carry limit. Actual leave wages and encashment payments must come from payment records; no rounding policy is assumed.',
    evidenceReference: input.evidenceReference,
  };
}
