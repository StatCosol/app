/* eslint-disable @typescript-eslint/unbound-method -- Read decorator metadata from original methods; never invoke them. */
import 'reflect-metadata';
import { CronTime } from 'cron';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { BranchComplianceCronService } from '../branch-compliance/branch-compliance-cron.service';
import { ComplianceCronService } from '../compliance/compliance-cron.service';
import { SafetyDocumentsService } from '../safety-documents/safety-documents.service';

// Inspect scheduling metadata only: never execute a job or send a notification.
describe('Indian business reminder schedules on a UTC host', () => {
  const branch = BranchComplianceCronService.prototype;
  const compliance = ComplianceCronService.prototype;
  const safety = SafetyDocumentsService.prototype;
  it.each([
    [branch.handleOverdueCheck, '2026-11-26T19:30:00.000Z'],
    [branch.handleT5Reminder, '2026-11-27T03:30:00.000Z'],
    [branch.handleT2Reminder, '2026-11-27T04:00:00.000Z'],
    [compliance.markOverdueAndNotify, '2026-11-26T20:00:00.000Z'],
    [compliance.sendSlaReminders, '2026-11-26T19:30:00.000Z'],
    [compliance.sendReuploadReminders, '2026-11-27T04:00:00.000Z'],
    [compliance.sendMcdReminders, '2026-11-27T04:30:00.000Z'],
    [compliance.escalateOverdueMcd, '2026-12-01T02:30:00.000Z'],
    [compliance.notifyNonCompliantAuditDocuments, '2026-11-26T20:30:00.000Z'],
    [safety.checkExpiringSafetyDocuments, '2026-11-27T02:30:00.000Z'],
  ])('%p next runs at %s', (handler, expected) => {
    const options = Reflect.getMetadata(SCHEDULE_CRON_OPTIONS, handler);
    expect(options.timeZone).toBe('Asia/Kolkata');
    const schedule = new CronTime(options.cronTime, options.timeZone);
    const next = schedule.getNextDateFrom(
      new Date('2026-11-26T18:30:00Z'),
      options.timeZone,
    );
    expect(next.toJSDate().toISOString()).toBe(expected);
  });

  it('compares compliance deadlines using the Indian date during the early jobs', () => {
    const service = Object.create(ComplianceCronService.prototype);
    expect(service.toDateOnly(new Date('2026-11-26T19:30:00Z'))).toBe(
      '2026-11-27',
    );
    expect(service.toDateOnly(new Date('2026-12-31T19:30:00Z'))).toBe(
      '2027-01-01',
    );
  });
});
