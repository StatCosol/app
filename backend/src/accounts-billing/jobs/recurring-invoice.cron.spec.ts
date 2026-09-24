import {
  RecurringInvoiceCron,
  recurringInvoiceId,
  advanceRecurringDate,
} from './recurring-invoice.cron';
import { BillingFrequency } from '../enums';

describe('Recurring billing recovery with synthetic invoices', () => {
  function setup() {
    const stored = new Map<string, any>();
    const config = {
      id: 'config-a',
      billingClientId: 'client-a',
      nextRunDate: '2026-09-01',
      frequency: BillingFrequency.MONTHLY,
      createdBy: 'accounts-a',
      defaultAmount: 100,
    } as any;
    const configRepo = { save: jest.fn().mockResolvedValue(undefined) };
    const clientRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'client-a',
        billingEmail: 'billing@example.invalid',
      }),
    };
    const invoices = {
      create: jest.fn(async (dto, actor, id) => {
        const invoice = {
          id,
          billingClientId: dto.billingClientId,
          invoiceStatus: 'DRAFT',
          mailStatus: 'NOT_SENT',
        };
        stored.set(id, invoice);
        return invoice;
      }),
      approve: jest.fn(async (id) => {
        stored.get(id).invoiceStatus = 'APPROVED';
      }),
    };
    const mail = {
      sendInvoice: jest.fn(async (id) => {
        stored.get(id).mailStatus = 'SENT';
        return { success: true };
      }),
    };
    const ds = {
      getRepository: () => ({
        findOne: jest.fn(async ({ where }) => stored.get(where.id) || null),
      }),
    };
    const cron = new RecurringInvoiceCron(
      configRepo as any,
      clientRepo as any,
      invoices as any,
      mail as any,
      {} as any,
      ds as any,
    );
    const run = () => (cron as any).processOne({ ...config }, '2026-09-01');
    return { stored, config, configRepo, clientRepo, invoices, mail, run };
  }
  it('reuses one invoice after repeated mail exceptions', async () => {
    const x = setup();
    x.mail.sendInvoice.mockRejectedValue(new Error('provider unavailable'));
    await expect(x.run()).rejects.toThrow('provider');
    await expect(x.run()).rejects.toThrow('provider');
    expect(x.invoices.create).toHaveBeenCalledTimes(1);
    expect(x.configRepo.save).not.toHaveBeenCalled();
  });
  it('does not advance a negative delivery result; retries the existing invoice', async () => {
    const x = setup();
    x.mail.sendInvoice.mockResolvedValueOnce({ success: false });
    await expect(x.run()).rejects.toThrow('delivery failed');
    expect(x.configRepo.save).not.toHaveBeenCalled();
    await expect(x.run()).resolves.toBe('ok');
    expect(x.invoices.create).toHaveBeenCalledTimes(1);
    expect(x.configRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ nextRunDate: '2026-10-01' }),
    );
  });
  it('does not resend after delivered invoice but failed schedule save', async () => {
    const x = setup();
    x.configRepo.save.mockRejectedValueOnce(new Error('db unavailable'));
    await expect(x.run()).rejects.toThrow('db');
    await x.run();
    expect(x.mail.sendInvoice).toHaveBeenCalledTimes(1);
    expect(x.invoices.create).toHaveBeenCalledTimes(1);
  });
  it('does not email an invoice whose approval failed', async () => {
    const x = setup();
    x.invoices.approve.mockRejectedValue(new Error('approval failed'));
    await expect(x.run()).rejects.toThrow('approval');
    expect(x.mail.sendInvoice).not.toHaveBeenCalled();
  });
  it('keeps missing-email configurations due', async () => {
    const x = setup();
    x.clientRepo.findOne.mockResolvedValue({
      id: 'client-a',
      billingEmail: '',
    });
    await expect(x.run()).resolves.toBe('no_email');
    expect(x.configRepo.save).not.toHaveBeenCalled();
  });
  it('refuses a mismatched client and cancelled invoice', async () => {
    const x = setup();
    const id = recurringInvoiceId(x.config.id, x.config.nextRunDate);
    x.stored.set(id, { billingClientId: 'client-b' });
    await expect(x.run()).rejects.toThrow('mismatch');
    x.stored.set(id, {
      billingClientId: 'client-a',
      invoiceStatus: 'CANCELLED',
    });
    await expect(x.run()).rejects.toThrow('cancelled');
    expect(x.mail.sendInvoice).not.toHaveBeenCalled();
  });
  it('separates clients/configurations/periods and clamps calendar month ends', () => {
    expect(recurringInvoiceId('a', '2026-09-01')).toBe(
      recurringInvoiceId('a', '2026-09-01'),
    );
    expect(recurringInvoiceId('a', '2026-09-01')).not.toBe(
      recurringInvoiceId('b', '2026-09-01'),
    );
    expect(recurringInvoiceId('a', '2026-09-01')).not.toBe(
      recurringInvoiceId('a', '2026-10-01'),
    );
    expect(advanceRecurringDate('2026-01-31', BillingFrequency.MONTHLY)).toBe(
      '2026-02-28',
    );
    expect(advanceRecurringDate('2028-01-31', BillingFrequency.MONTHLY)).toBe(
      '2028-02-29',
    );
    expect(advanceRecurringDate('2028-02-29', BillingFrequency.YEARLY)).toBe(
      '2029-02-28',
    );
  });
});
