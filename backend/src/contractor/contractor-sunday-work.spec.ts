import {
  addDays,
  allocateCompOff,
  lastSundayOfMonth,
  sundayDaysFromDated,
  sundayExtraPay,
  sundaysBetween,
} from './contractor-sunday-work';

describe('Sunday helpers', () => {
  it.each([
    ['2026-09-01', '2026-09-30', 4],
    ['2026-11-01', '2026-11-30', 5],
    ['2026-11-02', '2026-11-07', 0],
    ['2026-11-10', '2026-11-01', 0],
  ])('counts Sundays from %s to %s', (from, to, expected) => {
    expect(sundaysBetween(from, to)).toBe(expected);
  });

  it('finds the last Sunday of a month', () => {
    expect(lastSundayOfMonth('2026-09')).toBe('2026-09-27');
    expect(lastSundayOfMonth('2026-11')).toBe('2026-11-29');
  });

  it('adds days across months', () => {
    expect(addDays('2026-09-27', 90)).toBe('2026-12-26');
  });

  it('counts payable Sunday days in a dated ledger', () => {
    expect(
      sundayDaysFromDated([
        { date: '2026-11-01', days: 1 }, // Sunday
        { date: '2026-11-02', days: 1 },
        { date: '2026-11-08', days: 0.5 }, // Sunday, half day
        { date: '2026-11-15', days: 0 }, // Sunday, absent
      ]),
    ).toBe(1.5);
  });
});

describe('sundayExtraPay', () => {
  it('pays one extra day for each Sunday not taken as C-off', () => {
    expect(
      sundayExtraPay({
        sundayDaysWorked: 3,
        sundayCoffDays: 1,
        coffAvailedDays: 0,
        coffConvertedDays: 0,
        dayRate: 650,
      }),
    ).toEqual({ doubleDays: 2, paidDays: 2, amount: 1300 });
  });

  it('pays C-off days taken and expired C-offs', () => {
    expect(
      sundayExtraPay({
        sundayDaysWorked: 0,
        sundayCoffDays: 0,
        coffAvailedDays: 1,
        coffConvertedDays: 2,
        dayRate: 700,
      }),
    ).toEqual({ doubleDays: 2, paidDays: 3, amount: 2100 });
  });
});

describe('allocateCompOff', () => {
  const lot = (
    id: string,
    earnedPeriodMonth: string,
    expiresOn: string,
    balance: number,
  ) => ({ id, earnedPeriodMonth, expiresOn, balance });

  it('takes C-off from the lot that expires first', () => {
    const result = allocateCompOff(
      [
        lot('late', '2026-09', '2026-12-26', 1),
        lot('early', '2026-08', '2026-11-28', 1),
      ],
      '2026-10',
      1,
    );
    expect(result.availed).toEqual([{ lotId: 'early', days: 1 }]);
    expect(result.converted).toEqual([]);
    expect(result.shortfall).toBe(0);
  });

  it('converts unused C-off that expires within the month to double wages', () => {
    const result = allocateCompOff(
      [
        lot('a', '2026-06', '2026-09-20', 1),
        lot('b', '2026-08', '2026-11-28', 1),
      ],
      '2026-09',
      0,
    );
    expect(result.converted).toEqual([{ lotId: 'a', days: 1 }]);
  });

  it('converts a lot that expired earlier without being settled', () => {
    const result = allocateCompOff(
      [lot('missed', '2026-04', '2026-07-26', 1)],
      '2026-09',
      0,
    );
    expect(result.converted).toEqual([{ lotId: 'missed', days: 1 }]);
  });

  it('does not let an already expired lot be taken as C-off', () => {
    const result = allocateCompOff(
      [lot('missed', '2026-04', '2026-07-26', 1)],
      '2026-09',
      1,
    );
    expect(result.availed).toEqual([]);
    expect(result.shortfall).toBe(1);
    expect(result.converted).toEqual([{ lotId: 'missed', days: 1 }]);
  });

  it('ignores lots earned in a later month', () => {
    const result = allocateCompOff(
      [lot('future', '2026-10', '2027-01-24', 1)],
      '2026-09',
      1,
    );
    expect(result.shortfall).toBe(1);
  });

  it('reports a shortfall when more C-off is taken than is available', () => {
    const result = allocateCompOff(
      [lot('a', '2026-08', '2026-11-28', 0.5)],
      '2026-09',
      2,
    );
    expect(result.availed).toEqual([{ lotId: 'a', days: 0.5 }]);
    expect(result.shortfall).toBe(1.5);
  });
});
