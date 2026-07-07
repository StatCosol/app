import { BadRequestException } from '@nestjs/common';
import { InvoiceType } from '../enums';
import { BillingNumberService } from './billing-number.service';

describe('BillingNumberService', () => {
  function makeService(options?: {
    prefix?: string;
    lastInvoiceNumber?: string | null;
  }) {
    const qb = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest
        .fn()
        .mockResolvedValue(
          options?.lastInvoiceNumber
            ? { invoiceNumber: options.lastInvoiceNumber }
            : null,
        ),
    };
    const invoiceRepo = {
      createQueryBuilder: jest.fn(() => qb),
    };
    const settingsRepo = {
      findOne: jest.fn().mockResolvedValue({
        invoicePrefix: options?.prefix ?? 'STS/INV',
        proformaPrefix: options?.prefix ?? 'STS/PI',
        creditNotePrefix: options?.prefix ?? 'STS/CN',
      }),
    };

    return {
      service: new BillingNumberService(
        invoiceRepo as any,
        settingsRepo as any,
      ),
      qb,
    };
  }

  it('generates invoice numbers with a maximum length of 16', async () => {
    const { service, qb } = makeService();

    const invoiceNumber = await service.generateInvoiceNumber(
      InvoiceType.TAX_INVOICE,
      '2026-07-08',
    );

    expect(invoiceNumber).toBe('STSINV/2627/0001');
    expect(invoiceNumber).toHaveLength(16);
    expect(qb.where).toHaveBeenCalledWith('inv.invoice_number LIKE :prefix', {
      prefix: 'STSINV/2627/%',
    });
  });

  it('continues the compact sequence for the same prefix and financial year', async () => {
    const { service } = makeService({
      lastInvoiceNumber: 'STSINV/2627/0009',
    });

    await expect(
      service.generateInvoiceNumber(InvoiceType.TAX_INVOICE, '2026-07-08'),
    ).resolves.toBe('STSINV/2627/0010');
  });

  it('rejects prefixes that cannot fit the 16 character invoice limit', async () => {
    const { service } = makeService({ prefix: 'STATCO/INV' });

    await expect(
      service.generateInvoiceNumber(InvoiceType.TAX_INVOICE, '2026-07-08'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
