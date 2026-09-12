import { dueScheduleKey } from './control-schedule';
describe('Automation calendar scheduling', () => {
  it('uses the Indian business date at midnight', () =>
    expect(
      dueScheduleKey({ local_time: '00:00' }, new Date('2026-09-11T18:30:00Z')),
    ).toBe('2026-09-12'));
  it('does not run before the local time', () =>
    expect(
      dueScheduleKey({ local_time: '08:00' }, new Date('2026-09-12T02:29:00Z')),
    ).toBeNull());
  it('catches up once within the current weekly period', () => {
    const s = {
      frequency: 'WEEKLY' as const,
      week_day: 2,
      local_time: '09:00',
    };
    expect(dueScheduleKey(s, new Date('2026-09-08T10:00:00Z'))).toBeNull();
    expect(dueScheduleKey(s, new Date('2026-09-09T03:29:00Z'))).toBeNull();
    expect(dueScheduleKey(s, new Date('2026-09-09T03:30:00Z'))).toBe(
      '2026-09-07',
    );
    expect(dueScheduleKey(s, new Date('2026-09-12T10:00:00Z'))).toBe(
      '2026-09-07',
    );
  });
  it('clamps monthly schedules for leap and non-leap February', () => {
    const s = {
      frequency: 'MONTHLY' as const,
      month_day: 31,
      local_time: '09:00',
    };
    expect(dueScheduleKey(s, new Date('2028-02-28T10:00:00Z'))).toBeNull();
    expect(dueScheduleKey(s, new Date('2028-02-29T10:00:00Z'))).toBe('2028-02');
    expect(dueScheduleKey(s, new Date('2027-02-28T10:00:00Z'))).toBe('2027-02');
  });
});
