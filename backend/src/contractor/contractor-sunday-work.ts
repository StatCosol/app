import { BadRequestException } from '@nestjs/common';

/**
 * Sunday work for contract labour.
 *
 * A Sunday worked is already a payable day (payroll divides by the month's
 * working days and multiplies by every day worked). On top of that the branch
 * decides, per worker, how many of those Sundays become a compensatory off
 * (C-off); every other Sunday earns one extra day's wage, which makes it double.
 *
 * A C-off must be taken within COMP_OFF_VALIDITY_DAYS. One still unused when it
 * expires is paid as double wages in the payroll month in which it expires.
 */
export const COMP_OFF_VALIDITY_DAYS = 90;

const DAY_MS = 86400000;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function toUtc(iso: string): Date {
  const d = new Date(`${iso}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '') ||
    Number.isNaN(d.getTime()) ||
    d.toISOString().slice(0, 10) !== iso
  )
    throw new BadRequestException(`Invalid date ${iso}`);
  return d;
}

export function isSunday(iso: string): boolean {
  return toUtc(iso).getUTCDay() === 0;
}

/** Sundays from start to end, both inclusive (0 when start is after end). */
export function sundaysBetween(startIso: string, endIso: string): number {
  const end = toUtc(endIso).getTime();
  let count = 0;
  for (let t = toUtc(startIso).getTime(); t <= end; t += DAY_MS)
    if (new Date(t).getUTCDay() === 0) count++;
  return count;
}

/** The last Sunday of a YYYY-MM wage month. */
export function lastSundayOfMonth(periodMonth: string): string {
  const [year, month] = periodMonth.split('-').map(Number);
  const d = new Date(Date.UTC(year, month, 0));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Payable days falling on Sundays in a dated attendance ledger. */
export function sundayDaysFromDated(
  dated: Array<{ date: string; days: number }>,
): number {
  return round2(
    dated
      .filter((r) => Number(r.days) > 0 && isSunday(r.date))
      .reduce((n, r) => n + Number(r.days), 0),
  );
}

export interface CompOffLot {
  id: string;
  earnedPeriodMonth: string;
  expiresOn: string;
  balance: number;
}

/**
 * Settles a worker's C-off lots for one wage month.
 *
 * C-off days taken this month use the lots that expire first (only lots earned
 * in this month or earlier, not yet expired before the month starts). Whatever
 * is still unused on a lot that expires by the end of the month — or already
 * expired without being settled — is converted to double wages.
 */
export function allocateCompOff(
  lots: CompOffLot[],
  periodMonth: string,
  availDays: number,
) {
  const monthStart = `${periodMonth}-01`;
  const [year, month] = periodMonth.split('-').map(Number);
  const monthEnd = new Date(Date.UTC(year, month, 0))
    .toISOString()
    .slice(0, 10);
  const open = lots
    .filter((l) => l.earnedPeriodMonth <= periodMonth && Number(l.balance) > 0)
    .map((l) => ({ ...l, balance: round2(Number(l.balance)) }))
    .sort(
      (a, b) =>
        a.expiresOn.localeCompare(b.expiresOn) || a.id.localeCompare(b.id),
    );
  const availed: Array<{ lotId: string; days: number }> = [];
  let remaining = round2(Math.max(0, availDays));
  for (const lot of open) {
    if (remaining <= 0) break;
    if (lot.expiresOn < monthStart) continue;
    const take = Math.min(lot.balance, remaining);
    availed.push({ lotId: lot.id, days: round2(take) });
    lot.balance = round2(lot.balance - take);
    remaining = round2(remaining - take);
  }
  const converted = open
    .filter((l) => l.balance > 0 && l.expiresOn <= monthEnd)
    .map((l) => ({ lotId: l.id, days: l.balance }));
  return { availed, converted, shortfall: remaining };
}

/** Extra wage for Sunday work and C-off days in a month. */
export function sundayExtraPay(input: {
  sundayDaysWorked: number;
  sundayCoffDays: number;
  coffAvailedDays: number;
  coffConvertedDays: number;
  dayRate: number;
}) {
  const doubleDays = round2(
    input.sundayDaysWorked - input.sundayCoffDays + input.coffConvertedDays,
  );
  const paidDays = round2(doubleDays + input.coffAvailedDays);
  return {
    doubleDays,
    paidDays,
    amount: round2(paidDays * input.dayRate),
  };
}
