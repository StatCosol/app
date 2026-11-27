import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { EmailService } from './email.service';
import { NotificationDigestService } from './notification-digest.service';
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));
describe('Daily notification routing', () => {
  const sendMail = jest.fn().mockResolvedValue({ messageId: 'simulated' });
  const enqueue = jest
    .fn()
    .mockResolvedValue({ ok: true, queued: true, digestEventId: 'event' });
  const flush = jest.fn();
  const setup = (enabled = 'true') => {
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    const values: Record<string, string> = {
      EMAIL_ENABLED: enabled,
      SMTP_USER: 'sender@example.invalid',
      SMTP_PASS: 'dummy-local-only',
    };
    return new EmailService(
      {
        get: (key: string, fallback: unknown) => values[key] ?? fallback,
      } as ConfigService,
      { enqueue, flush } as unknown as NotificationDigestService,
    );
  };
  beforeEach(() => {
    jest.clearAllMocks();
    enqueue.mockResolvedValue({
      ok: true,
      queued: true,
      digestEventId: 'event',
    });
  });
  it('queues all operational categories without SMTP and keeps recipient boundaries', async () => {
    const svc = setup();
    await svc.sendAuditMail('audit@example.invalid', 'audit', 'title', 'body', {
      bcc: 'private@example.invalid',
    });
    await svc.sendPayrollMail(
      'payroll@example.invalid',
      'payroll',
      'title',
      'body',
    );
    await svc.sendComplianceMail(
      'compliance@example.invalid',
      'compliance',
      'title',
      'body',
    );
    await svc.sendNotificationMail(
      'finance@example.invalid',
      'payment',
      'title',
      'body',
      'Payment reminders',
    );
    expect(enqueue).toHaveBeenCalledTimes(4);
    expect(sendMail).not.toHaveBeenCalled();
    expect(enqueue.mock.calls[0][0]).toMatchObject({
      to: 'audit@example.invalid',
      bcc: 'private@example.invalid',
    });
  });
  it('sends authentication and requested invoices immediately, including attachments', async () => {
    const svc = setup();
    await svc.send('user@example.invalid', 'Password reset', 'Reset', 'body');
    await svc.send(
      'billing@example.invalid',
      'Invoice',
      'Invoice',
      'body',
      undefined,
      { attachments: [{ filename: 'invoice.pdf', content: 'test' }] },
    );
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(enqueue).not.toHaveBeenCalled();
    expect(sendMail.mock.calls[1][0].attachments).toHaveLength(1);
  });
  it('fails closed if queuing fails, without per-task email fallback', async () => {
    const svc = setup();
    enqueue.mockRejectedValueOnce(new Error('database unavailable'));
    expect(
      await svc.sendAuditMail('x@example.invalid', 'subject', 'title', 'body'),
    ).toMatchObject({ ok: false });
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('does not queue or send when email is disabled', async () => {
    const svc = setup('false');
    expect(
      await svc.sendAuditMail('x@example.invalid', 'subject', 'title', 'body'),
    ).toEqual({ skipped: true });
    await svc.deliverDailySummaries();
    expect(enqueue).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('flushes a summary directly without putting it back into the queue', async () => {
    const svc = setup();
    flush.mockImplementationOnce(async (send) =>
      send('x@example.invalid', 'Daily summary', 'complete body'),
    );
    await svc.deliverDailySummaries();
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(enqueue).not.toHaveBeenCalled();
    expect(sendMail.mock.calls[0][0]).toMatchObject({
      to: 'x@example.invalid',
      subject: 'Daily summary',
      cc: undefined,
      bcc: undefined,
    });
  });
});
