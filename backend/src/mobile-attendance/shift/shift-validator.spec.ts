import { validateAgainstShift } from './shift-validator';

const shift = (overrides: Partial<any> = {}) => ({
  id: 's1',
  clientId: 'c1',
  employeeId: 'e1',
  startTime: '09:00',
  endTime: '18:00',
  graceInMin: 15,
  graceOutMin: 15,
  otThresholdMin: 30,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// IST=UTC+5:30. Convert an IST h:m to its UTC Date by subtracting 330 min.
const istUtc = (hh: number, mm: number) => {
  const totalMin = hh * 60 + mm - 330;
  const h = Math.floor((((totalMin % 1440) + 1440) % 1440) / 60);
  const m = ((totalMin % 60) + 60) % 60;
  return new Date(Date.UTC(2026, 4, 25, h, m));
};

describe('validateAgainstShift', () => {
  it('passes through when shift is null', () => {
    const r = validateAgainstShift(null, 'IN', new Date());
    expect(r.hasShift).toBe(false);
    expect(r.withinWindow).toBe(true);
  });

  it('accepts punch inside grace window for IN', () => {
    const r = validateAgainstShift(shift(), 'IN', istUtc(8, 50));
    expect(r.withinWindow).toBe(true);
    expect(r.earlyByMin).toBe(0);
  });

  it('flags punch well before shift start', () => {
    const r = validateAgainstShift(shift(), 'IN', istUtc(7, 0));
    expect(r.withinWindow).toBe(false);
    expect(r.earlyByMin).toBe(120);
    expect(r.reason).toMatch(/before shift start/);
  });

  it('computes OT minutes past threshold on OUT', () => {
    const r = validateAgainstShift(shift(), 'OUT', istUtc(19, 0));
    expect(r.lateByMin).toBe(60);
    expect(r.otMinutes).toBe(60);
  });

  it('treats overnight shifts as no-shift pass-through', () => {
    const r = validateAgainstShift(
      shift({ startTime: '22:00', endTime: '06:00' }),
      'IN',
      istUtc(22, 5),
    );
    expect(r.hasShift).toBe(false);
    expect(r.withinWindow).toBe(true);
  });
});
