import {
  statutoryLeaveCalculation,
  StatutoryLeaveInput,
} from './statutory-leave-calculator';
const input = (): StatutoryLeaveInput => ({
  year: 2026,
  standardSection32Confirmed: true,
  joiningDate: '2025-01-01',
  category: 'ADULT',
  workedDays: 180,
  layoffDays: 0,
  maternityDays: 0,
  annualLeaveDays: 0,
  awardedDays: 9,
  openingOrdinary: 0,
  openingRefused: 0,
  usedOrdinary: 0,
  usedRefused: 0,
  encashedOrdinary: 0,
  encashedRefused: 0,
  refusedThisYear: 0,
  evidenceReference: 'Verified annual ledger',
});
describe('Statutory annual leave', () => {
  it('requires confirmation of the applicable leave scheme', () => {
    expect(() =>
      statutoryLeaveCalculation({
        ...input(),
        standardSection32Confirmed: false,
      }),
    ).toThrow();
  });
  it('distinguishes qualifying days from earning days', () => {
    const x = input();
    x.workedDays = 160;
    x.layoffDays = 20;
    x.awardedDays = 8;
    expect(statutoryLeaveCalculation(x)).toMatchObject({
      qualifies: true,
      qualifyingDays: 180,
      minimumEarnedDays: 8,
      carryForward: 8,
    });
  });
  it('uses actual work and a quarter of remaining year for mid-year joiners', () => {
    const x = input();
    x.joiningDate = '2026-07-01';
    x.workedDays = 45;
    x.layoffDays = 10;
    x.awardedDays = 0;
    expect(statutoryLeaveCalculation(x).qualifies).toBe(false);
    x.workedDays = 46;
    x.awardedDays = 2.3;
    expect(statutoryLeaveCalculation(x)).toMatchObject({
      qualifies: true,
      minimumEarnedDays: 2.3,
    });
  });
  it('uses the distinct adolescent and underground rates', () => {
    for (const category of ['ADOLESCENT', 'UNDERGROUND_MINE'] as const) {
      const x = input();
      x.category = category;
      x.workedDays = 225;
      x.awardedDays = 15;
      expect(statutoryLeaveCalculation(x).minimumEarnedDays).toBe(15);
    }
  });
  it('does not assume a rounding policy or under-award fractional leave', () => {
    const x = input();
    x.category = 'ADOLESCENT';
    x.workedDays = 181;
    x.awardedDays = 12.06;
    expect(() => statutoryLeaveCalculation(x)).toThrow(/below/);
    x.awardedDays = 12.07;
    expect(statutoryLeaveCalculation(x).minimumEarnedFraction).toBe('181/15');
  });
  it('preserves refused balances and identifies excess for encashment', () => {
    const x = input();
    x.openingOrdinary = 30;
    x.openingRefused = 40;
    x.refusedThisYear = 5;
    expect(statutoryLeaveCalculation(x)).toMatchObject({
      ordinaryClosing: 34,
      refusedClosing: 45,
      carryOrdinary: 30,
      carryRefused: 45,
      carryForward: 75,
      encashableExcess: 4,
    });
  });
  it('calculates exit entitlement below the annual qualification threshold', () => {
    const x = input();
    x.exitDate = '2026-02-01';
    x.workedDays = 20;
    x.awardedDays = 1;
    x.openingOrdinary = 10;
    expect(statutoryLeaveCalculation(x)).toMatchObject({
      qualifies: true,
      carryForward: 0,
      encashableExcess: 11,
    });
  });
  it('rejects overlapping days, unavailable balances and unverified missing values', () => {
    const x = input();
    x.workedDays = 366;
    expect(() => statutoryLeaveCalculation(x)).toThrow(/employment period/);
    const y = input();
    y.usedRefused = 1;
    expect(() => statutoryLeaveCalculation(y)).toThrow(/available balance/);
    expect(() =>
      statutoryLeaveCalculation({ ...input(), layoffDays: undefined } as any),
    ).toThrow();
  });
});
