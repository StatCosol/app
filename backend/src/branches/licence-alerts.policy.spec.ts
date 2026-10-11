import { addCalendarDays } from '../common/operational-date';
import {
  isFactoryLicence,
  manpowerPolicy,
  renewalPolicy,
} from './licence-alerts.policy';

describe('Licence deadlines and deployment limits', () => {
  const today = '2026-10-11';
  it.each([
    ['Factory License', true],
    ['Factory Licence', true],
    ['Factories Act', true],
    ['Fire Safety', false],
  ])('identifies %s', (type, expected) => {
    expect(isFactoryLicence(type)).toBe(expected);
  });
  it.each([
    [61, false, 'UPCOMING', 31],
    [60, true, 'UPCOMING', 30],
    [31, true, 'UPCOMING', 1],
    [30, true, 'DUE_TODAY', 0],
    [29, true, 'OVERDUE', -1],
    [0, true, 'OVERDUE', -30],
    [-1, true, 'EXPIRED', -31],
  ])(
    'uses the 30-day renewal deadline at %i days before expiry',
    (days, visible, status, remaining) => {
      const policy = renewalPolicy(addCalendarDays(today, days), today);
      expect(policy).toMatchObject({
        visible,
        status,
        daysToRenewal: remaining,
        renewalDueDate: addCalendarDays(today, remaining),
      });
    },
  );
  it('sends weekly warnings, then daily reminders from the renewal deadline', () => {
    const expiry = addCalendarDays(today, 60);
    expect(renewalPolicy(expiry, today).reminderPeriod).toBe(
      renewalPolicy(expiry, addCalendarDays(today, 6)).reminderPeriod,
    );
    expect(
      renewalPolicy(expiry, addCalendarDays(today, 7)).reminderPeriod,
    ).not.toBe(renewalPolicy(expiry, today).reminderPeriod);
    expect(
      renewalPolicy(expiry, addCalendarDays(today, 30)).reminderPeriod,
    ).toBe(addCalendarDays(today, 30));
    expect(
      renewalPolicy(expiry, addCalendarDays(today, 31)).reminderPeriod,
    ).toBe(addCalendarDays(today, 31));
  });
  it('handles leap months and rejects invalid dates', () => {
    expect(renewalPolicy('2028-03-30', '2028-02-29').renewalDueDate).toBe(
      '2028-02-29',
    );
    expect(() => renewalPolicy('2026-02-30', today)).toThrow();
  });
  it('allows the licensed limit and warns only above it', () => {
    expect(manpowerPolicy(100, 70, 30)).toMatchObject({
      total: 100,
      excess: 0,
      status: 'AT_LIMIT',
    });
    expect(manpowerPolicy(100, 70, 31)).toMatchObject({
      total: 101,
      excess: 1,
      status: 'BREACHED',
    });
    expect(manpowerPolicy(100, 0, 0).status).toBe('WITHIN_LIMIT');
    expect(manpowerPolicy(null, 70, 31)).toMatchObject({
      status: 'UNCONFIGURED',
      excess: null,
    });
  });
});
