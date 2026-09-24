import { ClientCommPolicyService } from './client-comm-policy.service';
import { ClientCommsCronService } from './client-comms-cron.service';

describe('Per-client communication schedules', () => {
  it('preserves defaults without writing customer data', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const svc = new ClientCommPolicyService({ query } as any);
    expect(await svc.list('client-a')).toEqual([
      {
        commType: 'PAYROLL_INPUT_REQUEST',
        requestDay: 1,
        deadlineDay: 7,
        enabled: true,
        version: 0,
      },
      {
        commType: 'MCD_REQUEST',
        requestDay: 16,
        deadlineDay: 25,
        enabled: true,
        version: 0,
      },
    ]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual(['client-a']);
    expect(query.mock.calls[0][0]).toMatch(/^SELECT/);
  });
  it('rejects stale versions and impossible deadline order', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const svc = new ClientCommPolicyService({ query } as any);
    await expect(
      svc.save(
        'client-a',
        {
          commType: 'MCD_REQUEST',
          requestDay: 20,
          deadlineDay: 10,
          enabled: true,
          version: 0,
        },
        'admin',
      ),
    ).rejects.toThrow('Deadline');
    expect(query).not.toHaveBeenCalled();
    await expect(
      svc.save(
        'client-a',
        {
          commType: 'MCD_REQUEST',
          requestDay: 10,
          deadlineDay: 20,
          enabled: true,
          version: 3,
        },
        'admin',
      ),
    ).rejects.toThrow('Settings changed');
    expect(query.mock.calls[1][1]).toEqual([
      'client-a',
      'MCD_REQUEST',
      10,
      20,
      true,
      3,
      'admin',
    ]);
  });
  function setup(day = 1, enabled = true) {
    const query = jest.fn(async (sql: string) =>
      sql.includes('FROM clients c')
        ? [{ id: 'client-a', name: 'Synthetic client' }]
        : [],
    );
    const contacts = {
      getActiveEmails: jest.fn().mockResolvedValue(['payroll@example.invalid']),
    };
    const email = {
      sendPayrollMail: jest.fn().mockResolvedValue({ ok: true }),
      sendAuditMail: jest.fn().mockResolvedValue({ ok: true }),
    };
    const templates = {
      resolve: jest.fn().mockResolvedValue({ subject: 'mock', body: 'mock' }),
    };
    const policies = {
      get: jest
        .fn()
        .mockResolvedValue({ requestDay: day, deadlineDay: 7, enabled }),
    };
    const locks = { runExclusive: jest.fn(async (_, fn) => fn()) };
    const svc = new ClientCommsCronService(
      { query } as any,
      contacts as any,
      email as any,
      templates as any,
      policies as any,
      locks as any,
    );
    return { svc, query, email, templates, policies, locks };
  }
  it('sends only on the configured day and links the previous month', async () => {
    const x = setup();
    await x.svc.runPayrollInputRequest({
      triggeredBy: 'CRON',
      runMonth: new Date('2026-09-01T03:30:00Z'),
    });
    expect(x.email.sendPayrollMail).toHaveBeenCalledTimes(1);
    expect(x.templates.resolve).toHaveBeenCalledWith(
      'PAYROLL_INPUT_REQUEST',
      expect.objectContaining({
        monthLabel: 'August 2026',
        portalUrl: expect.stringContaining('/client/payroll?month=2026-08'),
        deadlineLabel: expect.stringContaining('07'),
      }),
    );
    expect(x.locks.runExclusive).toHaveBeenCalledWith(
      'client-comms:PAYROLL_INPUT_REQUEST',
      expect.any(Function),
    );
  });
  it('does not backfill earlier request days or send disabled reminders', async () => {
    const x = setup();
    await x.svc.runPayrollInputRequest({
      triggeredBy: 'CRON',
      runMonth: new Date('2026-09-02T03:30:00Z'),
    });
    expect(x.email.sendPayrollMail).not.toHaveBeenCalled();
    const disabled = setup(1, false);
    await disabled.svc.runPayrollInputRequest({
      triggeredBy: 'admin',
      manual: true,
    });
    expect(disabled.email.sendPayrollMail).not.toHaveBeenCalled();
  });
});
