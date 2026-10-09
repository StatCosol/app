import { contractorHours, contractorPunchPair } from './contractor-hours';

describe('contractor overtime including breaks', () => {
  it.each([false, true])(
    'requires an exit after the final entry (closed=%s)',
    (closed) => {
      const punches = [
        { direction: 'IN', punchTime: '2026-10-08T03:30:00Z' },
        { direction: 'OUT', punchTime: '2026-10-08T12:30:00Z' },
        { direction: 'IN', punchTime: '2026-10-08T13:30:00Z' },
        ...(closed
          ? [{ direction: 'OUT', punchTime: '2026-10-08T14:30:00Z' }]
          : []),
      ];
      const { inPunch, outPunch } = contractorPunchPair(punches.reverse());
      expect(outPunch?.punchTime ?? null).toBe(
        closed ? '2026-10-08T14:30:00Z' : null,
      );
      expect(
        contractorHours(inPunch!.punchTime, outPunch?.punchTime ?? null)
          ?.otHours ?? null,
      ).toBe(closed ? 2.5 : null);
    },
  );
  it.each([
    ['11:30', 8, 0],
    ['12:00', 8.5, 0],
    ['12:01', 8.52, 0.02],
    ['12:30', 9, 0.5],
    ['13:00', 9.5, 1],
    ['15:30', 12, 3.5],
  ])('calculates a 09:00 IST start ending at %s UTC', (end, hours, otHours) => {
    expect(
      contractorHours('2026-10-08T03:30:00Z', `2026-10-08T${end}:00Z`),
    ).toEqual({ hours, otHours });
  });
  it.each([null, 'invalid', '2026-10-08T03:30:00Z', '2026-10-08T02:30:00Z'])(
    'does not invent duration for %s',
    (end) => {
      expect(contractorHours('2026-10-08T03:30:00Z', end)).toBeNull();
    },
  );
  it('includes intermediate break punches and supports AUTO devices', () => {
    for (const direction of ['AUTO', 'IN']) {
      const punches = [
        { direction, punchTime: '2026-10-08T03:30:00Z' },
        {
          direction: direction === 'AUTO' ? 'AUTO' : 'OUT',
          punchTime: '2026-10-08T07:00:00Z',
        },
        { direction, punchTime: '2026-10-08T07:30:00Z' },
        {
          direction: direction === 'AUTO' ? 'AUTO' : 'OUT',
          punchTime: '2026-10-08T13:00:00Z',
        },
      ];
      const { inPunch, outPunch } = contractorPunchPair(punches.reverse());
      expect(
        contractorHours(inPunch!.punchTime, outPunch!.punchTime)?.otHours,
      ).toBe(1);
    }
  });
  it('does not mistake repeated IN punches for a complete day', () => {
    expect(
      contractorPunchPair([
        { direction: 'IN', punchTime: '2026-10-08T03:30:00Z' },
        { direction: 'IN', punchTime: '2026-10-08T15:30:00Z' },
      ]).outPunch,
    ).toBeNull();
  });
});
