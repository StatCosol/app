import { BadRequestException } from '@nestjs/common';
import { InvoiceType } from '../enums';
import { BillingNumberService } from './billing-number.service';

describe('BillingNumberService', () => {
  function makeService(options?: { prefix?: string; maximum?: string }) {
    const settingsRepo = {
      findOne: jest.fn().mockResolvedValue({
        invoicePrefix: options?.prefix ?? 'STS/INV',
        proformaPrefix: options?.prefix ?? 'STS/PI',
        creditNotePrefix: options?.prefix ?? 'STS/CN',
      }),
    };
    const manager = {
      queryRunner: { isTransactionActive: true },
      getRepository: jest.fn().mockReturnValue(settingsRepo),
      query: jest.fn(async (sql: string) =>
        sql.includes('MAX(') ? [{ maximum: options?.maximum ?? '0' }] : [],
      ),
    };
    return {
      service: new BillingNumberService({} as any, settingsRepo as any),
      manager,
    };
  }

  it('locks the normalized series before reading its numeric maximum', async () => {
    const { service, manager } = makeService();
    const number = await service.generateInvoiceNumber(
      InvoiceType.TAX_INVOICE,
      '2026-07-08',
      manager as any,
    );
    expect(number).toBe('STSINV/2627/0001');
    expect(number).toHaveLength(16);
    expect(manager.query).toHaveBeenNthCalledWith(
      1,
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['billing-invoice:STSINV/2627/'],
    );
    expect(manager.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('::numeric'),
      ['^STSINV/2627/[0-9]+$', 'STSINV/2627/%'],
    );
  });

  it('continues the numeric sequence', async () => {
    const { service, manager } = makeService({ maximum: '9' });
    await expect(
      service.generateInvoiceNumber(
        InvoiceType.TAX_INVOICE,
        '2026-07-08',
        manager as any,
      ),
    ).resolves.toBe('STSINV/2627/0010');
  });

  it.each([
    [InvoiceType.PROFORMA, 'STSPI/2627/0001'],
    [InvoiceType.TAX_INVOICE, 'STSINV/2627/0001'],
    [InvoiceType.CREDIT_NOTE, 'STSCN/2627/0001'],
  ])('uses the configured series for %s', async (type, expected) => {
    const { service, manager } = makeService();
    await expect(
      service.generateInvoiceNumber(type, '2026-07-31', manager as any),
    ).resolves.toBe(expected);
  });

  it('shares a lock when different types normalize to the same prefix', async () => {
    const { service, manager } = makeService({ prefix: 'S-T/S' });
    await service.generateInvoiceNumber(
      InvoiceType.PROFORMA,
      '2026-07-31',
      manager as any,
    );
    await service.generateInvoiceNumber(
      InvoiceType.TAX_INVOICE,
      '2026-07-31',
      manager as any,
    );
    expect(manager.query.mock.calls[0]).toEqual(manager.query.mock.calls[2]);
  });

  it('rejects prefixes that cannot fit the existing invoice limit', async () => {
    const { service, manager } = makeService({ prefix: 'STATCO/INV' });
    await expect(
      service.generateInvoiceNumber(
        InvoiceType.TAX_INVOICE,
        '2026-07-08',
        manager as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.query).not.toHaveBeenCalled();
  });

  it.each([undefined, { queryRunner: { isTransactionActive: false } }])(
    'refuses allocation outside an active transaction: %j',
    async (manager) => {
      const { service } = makeService();
      await expect(
        service.generateInvoiceNumber(
          InvoiceType.TAX_INVOICE,
          '2026-07-08',
          manager as any,
        ),
      ).rejects.toThrow('requires an active transaction');
    },
  );

  it.each(['9999', '10000', '9999999999999999999999999999999999999999'])(
    'rejects exhausted series instead of wrapping or overflowing: %s',
    async (maximum) => {
      const { service, manager } = makeService({ maximum });
      await expect(
        service.generateInvoiceNumber(
          InvoiceType.TAX_INVOICE,
          '2026-07-08',
          manager as any,
        ),
      ).rejects.toThrow('exceeded 9999');
    },
  );

  it.each([
    ['2026-03-31', '2025-26'],
    ['2026-04-01', '2026-27'],
  ])(
    'derives the financial year from the UTC-parsed calendar date %s',
    (date, year) => {
      const { service } = makeService();
      const input = new Date(date);
      // Date-only ISO strings are UTC; local getters must not choose the series.
      jest.spyOn(input, 'getMonth').mockImplementation(() => {
        throw new Error('local getter');
      });
      jest.spyOn(input, 'getFullYear').mockImplementation(() => {
        throw new Error('local getter');
      });
      expect(service.getFinancialYear(input)).toBe(year);
    },
  );

  it('rejects invalid dates without locking a made-up series', async () => {
    const { service, manager } = makeService();
    await expect(
      service.generateInvoiceNumber(
        InvoiceType.TAX_INVOICE,
        'invalid',
        manager as any,
      ),
    ).rejects.toThrow('Invalid invoice date');
    expect(manager.query).not.toHaveBeenCalled();
  });
});
