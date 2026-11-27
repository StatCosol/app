import { PendingPaymentFollowupsService } from './pending-payment-followups.service';
describe('Payment reminder summary metadata', () => {
  const queued = { ok: true, queued: true, digestEventId: 'event' };
  const entity = {
    id: 'payment',
    status: 'PENDING',
    clientName: 'Fixture',
    clientEmail: 'test@example.invalid',
    invoiceNumber: 'TEST-ONLY',
    amount: 100,
    reminderCount: 7,
  };
  function setup(lastReminderStatus?: string) {
    const repo = {
      findOne: jest.fn().mockResolvedValue({ ...entity, lastReminderStatus }),
      update: jest.fn().mockResolvedValue({}),
      save: jest.fn(),
    };
    const builder = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({}),
    };
    const email = { sendNotificationMail: jest.fn().mockResolvedValue(queued) };
    const service = new PendingPaymentFollowupsService(
      repo as any,
      { createQueryBuilder: () => builder } as any,
      email as any,
      {} as any,
      {} as any,
    );
    return { repo, builder, email, service };
  }
  it('queues and records metadata without saving amounts, status or sent counters', async () => {
    const { repo, builder, email, service } = setup();
    expect(await service.sendReminder('payment')).toEqual({
      success: true,
      queued: true,
      reminderCount: 7,
    });
    expect(email.sendNotificationMail).toHaveBeenCalledTimes(1);
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith('payment', {
      lastReminderStatus: 'QUEUED',
      lastFailureReason: null,
    });
    expect(builder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        sentStatus: 'QUEUED',
        sentAt: null,
        digestEventId: 'event',
      }),
    );
  });
  it('does not enqueue another copy while pending delivery', async () => {
    const { service, email, repo } = setup('QUEUED');
    await service.sendReminder('payment');
    expect(email.sendNotificationMail).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });
  it('holds an untracked queued reminder for review if the delivery log fails', async () => {
    const { service, repo, builder } = setup();
    builder.execute.mockRejectedValueOnce(new Error('log unavailable'));
    expect(await service.sendReminder('payment')).toMatchObject({
      success: false,
      reminderCount: 7,
    });
    expect(repo.update).toHaveBeenLastCalledWith(
      'payment',
      expect.objectContaining({ lastReminderStatus: 'UNKNOWN' }),
    );
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('holds uncertain previous delivery for review rather than sending again', async () => {
    const { service, email } = setup('UNKNOWN');
    await expect(service.sendReminder('payment')).rejects.toThrow(
      'needs review',
    );
    expect(email.sendNotificationMail).not.toHaveBeenCalled();
  });
  it('records failed queuing without incrementing delivery counts', async () => {
    const { service, email, repo, builder } = setup();
    email.sendNotificationMail.mockResolvedValueOnce({
      ok: false,
      error: 'offline',
    } as any);
    expect(await service.sendReminder('payment')).toMatchObject({
      success: false,
      queued: false,
      reminderCount: 7,
    });
    expect(repo.update).toHaveBeenCalledWith('payment', {
      lastReminderStatus: 'FAILED',
      lastFailureReason: 'offline',
    });
    expect(builder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        sentStatus: 'FAILED',
        sentAt: null,
        digestEventId: null,
      }),
    );
  });
});
