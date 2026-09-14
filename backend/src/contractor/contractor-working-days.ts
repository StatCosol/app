import { BadRequestException } from '@nestjs/common';
import { ContractorRateCard } from './contractor-rate-card';

/**
 * Payroll divisor for a contractor wage month: the calendar days of the month
 * excluding Sundays (Sunday is the weekly off). September 2026 has 30 days and
 * 4 Sundays, so 26; October 2026 has 31 days and 4 Sundays, so 27; a 28-day
 * February always has exactly 24.
 *
 * Public holidays are deliberately not subtracted: they are paid days.
 *
 * @param periodMonth wage month as YYYY-MM
 */
export function workingDaysInMonth(periodMonth: string): number {
  const match = /^(\d{4})-(\d{2})$/.exec(periodMonth ?? '');
  const year = match ? Number(match[1]) : NaN;
  const month = match ? Number(match[2]) : NaN;
  if (!Number.isInteger(year) || month < 1 || month > 12)
    throw new BadRequestException('periodMonth must be YYYY-MM');

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let working = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() !== 0) working++;
  }
  return working;
}

/**
 * The rate card as it applies to a payroll run: prorated components use the
 * wage month's working days as the divisor, not the fixed divisor stored on the
 * quotation. The stored divisor still derives the quotation's reference daily
 * rate at upload, where no wage month exists yet.
 */
export function applyMonthDivisor(
  card: ContractorRateCard,
  periodMonth: string,
): ContractorRateCard {
  return { ...card, divisor: workingDaysInMonth(periodMonth) };
}
