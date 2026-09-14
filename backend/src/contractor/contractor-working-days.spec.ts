import { calculateRateCard, ContractorRateCard } from './contractor-rate-card';
import {
  applyMonthDivisor,
  workingDaysInMonth,
} from './contractor-working-days';

describe('workingDaysInMonth (calendar days excluding Sundays)', () => {
  it.each([
    ['2026-09', 26], // 30 days, Sundays 6/13/20/27
    ['2026-10', 27], // 31 days, Sundays 4/11/18/25
    ['2026-08', 26], // 31 days, 5 Sundays (2/9/16/23/30)
    ['2026-02', 24], // 28 days, 4 Sundays
    ['2024-02', 25], // leap year: 29 days, 4 Sundays
    ['2026-03', 26], // 31 days, 5 Sundays (1/8/15/22/29)
  ])('%s has %i working days', (month, expected) => {
    expect(workingDaysInMonth(month)).toBe(expected);
  });

  it('does not depend on the server time zone', () => {
    // A Sunday that starts the month must be excluded in UTC and IST alike.
    expect(workingDaysInMonth('2026-11')).toBe(25); // Sundays 1/8/15/22/29
  });

  it.each(['2026-13', '2026-9', '', 'abc'])('rejects %p', (bad) => {
    expect(() => workingDaysInMonth(bad)).toThrow(
      'periodMonth must be YYYY-MM',
    );
  });
});

describe('applyMonthDivisor', () => {
  const card: ContractorRateCard = {
    divisor: 30, // quotation's stored divisor
    rounding: 'RUPEE',
    components: [
      {
        code: 'BASIC_DA',
        label: 'Basic + DA',
        category: 'EARNING',
        method: 'FIXED',
        value: 16900,
        prorate: true,
      },
    ],
  };

  it('prorates by the wage month working days, not the stored divisor', () => {
    // September 2026: 26 working days. 13 payable days = half a month.
    const result = calculateRateCard(applyMonthDivisor(card, '2026-09'), 13);
    expect(result.amounts.BASIC_DA).toBe(8450); // 16900 × 13 / 26
  });

  it('pays the full monthly amount when every working day is payable', () => {
    const result = calculateRateCard(applyMonthDivisor(card, '2026-10'), 27);
    expect(result.amounts.BASIC_DA).toBe(16900);
  });

  it('leaves the stored card unchanged', () => {
    applyMonthDivisor(card, '2026-09');
    expect(card.divisor).toBe(30);
  });
});
