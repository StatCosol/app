import { TaskGeneratorService } from './task-generator.service';
import { Periodicity } from '../entities/enums';
import { AeComplianceMasterEntity } from '../entities/ae-compliance-master.entity';

/**
 * TaskGeneratorService tests — period-start/due-date derivation per periodicity,
 * plus license-expiry reminder dates. Pure date arithmetic where off-by-one and
 * month-boundary bugs are common.
 */
const compliance = (
  periodicity: Periodicity,
  taskTemplate: Record<string, unknown> = {},
) => ({ periodicity, taskTemplate }) as unknown as AeComplianceMasterEntity;

describe('TaskGeneratorService.getPeriodicSchedule', () => {
  let svc: TaskGeneratorService;
  const NOW = new Date(2026, 4, 15); // 15 May 2026 (month index 4)
  beforeEach(() => {
    svc = new TaskGeneratorService();
  });

  it('MONTHLY → the current calendar month', () => {
    expect(
      svc.getPeriodicSchedule(compliance(Periodicity.MONTHLY), NOW),
    ).toEqual({
      periodStart: '2026-05-01',
      dueDate: '2026-05-31',
    });
  });

  it('QUARTERLY → quarter start and end of the quarter', () => {
    expect(
      svc.getPeriodicSchedule(compliance(Periodicity.QUARTERLY), NOW),
    ).toEqual({ periodStart: '2026-04-01', dueDate: '2026-06-30' });
  });

  it('HALF_YEARLY → half-year start and end', () => {
    expect(
      svc.getPeriodicSchedule(compliance(Periodicity.HALF_YEARLY), NOW),
    ).toEqual({ periodStart: '2026-01-01', dueDate: '2026-06-30' });
  });

  it('ANNUAL → calendar year', () => {
    expect(
      svc.getPeriodicSchedule(compliance(Periodicity.ANNUAL), NOW),
    ).toEqual({
      periodStart: '2026-01-01',
      dueDate: '2026-12-31',
    });
  });

  it('applies a positive dueDayOffset past the period end', () => {
    // MONTHLY due 2026-05-31 + 10 days = 2026-06-10
    expect(
      svc.getPeriodicSchedule(
        compliance(Periodicity.MONTHLY, { dueDayOffset: 10 }),
        NOW,
      ),
    ).toEqual({ periodStart: '2026-05-01', dueDate: '2026-06-10' });
  });

  it('returns null for AS_REQUIRED / EVENT / unhandled periodicities', () => {
    expect(
      svc.getPeriodicSchedule(compliance(Periodicity.AS_REQUIRED), NOW),
    ).toBeNull();
    expect(
      svc.getPeriodicSchedule(compliance(Periodicity.EVENT), NOW),
    ).toBeNull();
    expect(
      svc.getPeriodicSchedule(compliance(Periodicity.BI_MONTHLY), NOW),
    ).toBeNull();
  });
});

describe('TaskGeneratorService.getExpiryReminderDates', () => {
  let svc: TaskGeneratorService;
  beforeEach(() => {
    svc = new TaskGeneratorService();
  });

  it('returns a reminder date for each lead time before expiry', () => {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 100); // 100 days out
    const dates = svc.getExpiryReminderDates(expiry, [60, 30, 15]);
    expect(dates).toHaveLength(3); // all still in the future
  });

  it('drops lead times that fall in the past', () => {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 100);
    // 150 days before a 100-day-out expiry is in the past → dropped
    expect(svc.getExpiryReminderDates(expiry, [150])).toHaveLength(0);
  });
});
