import { automaticReminderDue } from './time-office-automation-time';
import {
  TimeOfficeAutomationDto,
  TimeOfficeAutomationService,
} from './time-office-automation.service';
import { validate } from 'class-validator';

describe('automatic Time Office follow-ups', () => {
  it('starts at 9am IST the next day, not at midnight or server-local morning', () => {
    expect(
      automaticReminderDue('2026-01-05', new Date('2026-01-06T03:29:59Z')),
    ).toBe(false);
    expect(
      automaticReminderDue('2026-01-05', new Date('2026-01-06T03:30:00Z')),
    ).toBe(true);
  });
  it('defers a late-ending overnight shift through grace and the import allowance', () => {
    const shift = {
      start_time: '23:00:00',
      end_time: '10:00:00',
      grace_out_min: 15,
    };
    expect(
      automaticReminderDue(
        '2026-01-05',
        new Date('2026-01-06T09:00:00+05:30'),
        shift,
      ),
    ).toBe(false);
    expect(
      automaticReminderDue(
        '2026-01-05',
        new Date('2026-01-06T12:14:59+05:30'),
        shift,
      ),
    ).toBe(false);
    expect(
      automaticReminderDue(
        '2026-01-05',
        new Date('2026-01-06T12:15:00+05:30'),
        shift,
      ),
    ).toBe(true);
  });
  it('handles month/year rollover', () => {
    expect(
      automaticReminderDue('2025-12-31', new Date('2026-01-01T09:00:00+05:30')),
    ).toBe(true);
  });
  it.each([{ days: [7] }, { days: [-1] }, { days: [0, 0] }, { days: ['1'] }])(
    'rejects invalid weekly-off days %j',
    async ({ days }) => {
      const dto = Object.assign(new TimeOfficeAutomationDto(), {
        enabled: true,
        weeklyOffDays: days,
      });
      expect((await validate(dto)).length).toBeGreaterThan(0);
    },
  );
  it('prevents an executive from changing automatic settings', async () => {
    const db = { query: jest.fn() };
    const service = new TimeOfficeAutomationService(
      db as any,
      {} as any,
      {} as any,
    );
    await expect(
      service.save(
        { roleCode: 'TIME_OFFICE_EXECUTIVE', clientId: 'company' } as any,
        { enabled: false, weeklyOffDays: [] },
      ),
    ).rejects.toThrow('Only Time Office Managers');
    expect(db.query).not.toHaveBeenCalled();
  });
  it('does not run for a company without the attendance entitlement', async () => {
    const db = {
      query: jest.fn().mockResolvedValue([{ client_id: 'company' }]),
    };
    const entitlements = { hasModule: jest.fn().mockResolvedValue(false) };
    const service = new TimeOfficeAutomationService(
      db as any,
      {} as any,
      entitlements as any,
    );
    const process = jest.spyOn(service, 'processCompany');
    await service.tick();
    expect(process).not.toHaveBeenCalled();
  });
});
