/**
 * Build a YYYY-MM month key from a Date (defaults to current month).
 * Use everywhere a month selector needs a default.
 */
export function monthKeyOf(date = new Date()): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Parse a YYYY-MM month key into { year, month }.
 */
export function parseMonthKey(key: string): { year: number; month: number } {
  const [y, m] = key.split('-').map(Number);
  return { year: y, month: m };
}
