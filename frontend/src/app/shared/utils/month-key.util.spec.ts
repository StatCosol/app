import { describe, it, expect } from 'vitest';
import { monthKeyOf, parseMonthKey } from './month-key.util';

describe('month-key util', () => {
  it('formats a date as YYYY-MM (month zero-padded)', () => {
    expect(monthKeyOf(new Date(2026, 4, 3))).toBe('2026-05'); // May
    expect(monthKeyOf(new Date(2026, 11, 31))).toBe('2026-12'); // Dec
    expect(monthKeyOf(new Date(2026, 0, 1))).toBe('2026-01'); // Jan
  });

  it('parses a YYYY-MM key into year and month numbers', () => {
    expect(parseMonthKey('2026-05')).toEqual({ year: 2026, month: 5 });
  });
});
