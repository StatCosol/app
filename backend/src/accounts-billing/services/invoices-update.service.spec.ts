import {
  BillingClient,
  BillingSetting,
  Invoice,
  InvoiceAuditLog,
  InvoiceItem,
} from '../entities';
import { InvoiceStatus, InvoiceType, PaymentStatus } from '../enums';
import { BillingCalculationService } from './billing-calculation.service';
import { InvoicesService } from './invoices.service';
import { BillingNumberService } from './billing-number.service';

describe('Invoice edit consistency', () => {
  function setup() {
    const client = {
      id: 'old-client',
      tenantId: 'tenant',
      stateCode: '29',
      gstin: 'new-master-gstin',
      placeOfSupply: 'Karnataka',
      defaultGstRate: 5,
    };
    const replacement = {
      ...client,
      id: 'new-client',
      gstin: 'replacement-gstin',
      defaultGstRate: 0,
    };
    const invoice = {
      id: 'invoice',
      billingClientId: client.id,
      billingClient: client,
      invoiceStatus: InvoiceStatus.DRAFT,
      paymentStatus: PaymentStatus.UNPAID,
      invoiceDate: '2026-09-27',
      invoiceType: InvoiceType.TAX_INVOICE,
      financialYear: '2026-27',
      amountReceived: '0.00',
      stateCode: '36',
      gstin: 'saved-gstin',
      placeOfSupply: 'Telangana',
      cgstRate: '9.00',
      sgstRate: '9.00',
      igstRate: '0.00',
      cgstAmount: 9,
      sgstAmount: 9,
      igstAmount: 0,
      totalGst: 18,
      grandTotal: 118,
      balanceOutstanding: 118,
      items: [
        {
          id: 'item',
          serviceDescription: 'Service',
          quantity: '1.00',
          rate: '100.00',
          amount: '100.00',
          discountAmount: '0.00',
          taxableAmount: '100.00',
          gstRate: '18.00',
          gstAmount: '18.00',
          lineTotal: '118.00',
        },
      ],
    };
    const invoiceRepo = {
      findOne: jest.fn().mockResolvedValue(invoice),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const itemRepo = { create: jest.fn((value) => value), remove: jest.fn() };
    const clientRepo = { findOne: jest.fn().mockResolvedValue(replacement) };
    const auditRepo = { create: jest.fn((value) => value), save: jest.fn() };
    const settings = { stateCode: '36', defaultGstRate: 18 };
    const repositories = new Map<any, any>([
      [Invoice, invoiceRepo],
      [InvoiceItem, itemRepo],
      [BillingClient, clientRepo],
      [InvoiceAuditLog, auditRepo],
      [BillingSetting, { findOne: jest.fn().mockResolvedValue(settings) }],
    ]);
    const manager = {
      getRepository: (entity: any) => repositories.get(entity),
    };
    const numberService = new BillingNumberService({} as any, {} as any);
    jest
      .spyOn(numberService, 'generateInvoiceNumber')
      .mockResolvedValue('TEST/2627/0001');
    const service = new InvoicesService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      new BillingCalculationService(),
      numberService,
      { transaction: async (callback) => callback(manager) } as any,
    );
    jest.spyOn(service, 'findOne').mockResolvedValue(invoice as any);
    return {
      service,
      invoice,
      client,
      replacement,
      settings,
      invoiceRepo,
      itemRepo,
      auditRepo,
    };
  }

  it.each([undefined, 'old-client'])(
    'preserves saved details on metadata edit (client=%s)',
    async (billingClientId) => {
      const { service, invoice, itemRepo } = setup();
      await service.update(
        invoice.id,
        { billingClientId, remarks: 'Updated' },
        'actor',
      );
      expect(invoice).toMatchObject({
        stateCode: '36',
        gstin: 'saved-gstin',
        placeOfSupply: 'Telangana',
        cgstAmount: 9,
        igstAmount: 0,
        grandTotal: 118,
      });
      expect(itemRepo.remove).not.toHaveBeenCalled();
    },
  );

  it('re-splits saved lines on a client-only change without replacing their identities or GST rates', async () => {
    const { service, invoice, itemRepo } = setup();
    const originalItems = structuredClone(invoice.items);
    await service.update(
      invoice.id,
      { billingClientId: 'new-client' },
      'actor',
    );
    expect(invoice).toMatchObject({
      billingClientId: 'new-client',
      stateCode: '29',
      gstin: 'replacement-gstin',
      placeOfSupply: 'Karnataka',
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 18,
      igstRate: 18,
      totalGst: 18,
      grandTotal: 118,
      balanceOutstanding: 118,
    });
    expect(invoice.items).toEqual(originalItems);
    expect(itemRepo.remove).not.toHaveBeenCalled();
  });

  it('honors an explicit place of supply during a client change', async () => {
    const { service, invoice } = setup();
    await service.update(
      invoice.id,
      { billingClientId: 'new-client', placeOfSupply: 'Explicit supply' },
      'actor',
    );
    expect(invoice.placeOfSupply).toBe('Explicit supply');
  });

  it('preserves saved tax treatment when current client and supplier settings change', async () => {
    const { service, invoice, settings } = setup();
    settings.stateCode = '27';
    await service.update(
      invoice.id,
      {
        billingClientId: 'old-client',
        items: [{ serviceDescription: 'Edited', quantity: 2, rate: 100 }],
      },
      'actor',
    );
    expect(invoice).toMatchObject({
      stateCode: '36',
      gstin: 'saved-gstin',
      cgstRate: 9,
      sgstRate: 9,
      cgstAmount: 18,
      sgstAmount: 18,
      igstAmount: 0,
      totalGst: 36,
      grandTotal: 236,
    });
  });

  it('uses a new client zero GST default when replacement lines omit rates', async () => {
    const { service, invoice } = setup();
    await service.update(
      invoice.id,
      {
        billingClientId: 'new-client',
        items: [
          { serviceDescription: 'Zero-rated service', quantity: 1, rate: 100 },
        ],
      },
      'actor',
    );
    expect(invoice).toMatchObject({
      totalGst: 0,
      grandTotal: 100,
      igstRate: 0,
    });
    expect(invoice.items[0]).toMatchObject({ gstRate: 0, gstAmount: 0 });
  });

  it('honors a numeric zero GST default during creation too', async () => {
    const { service } = setup();
    const result = await service.create(
      {
        billingClientId: 'new-client',
        invoiceType: InvoiceType.TAX_INVOICE,
        invoiceDate: '2026-09-27',
        items: [
          { serviceDescription: 'Zero-rated service', quantity: 1, rate: 100 },
        ],
      },
      'actor',
    );
    expect(result).toMatchObject({ totalGst: 0, grandTotal: 100, igstRate: 0 });
  });

  it('rejects an empty replacement item list without writes', async () => {
    const { service, invoice, invoiceRepo, itemRepo, auditRepo } = setup();
    await expect(
      service.update(invoice.id, { items: [] }, 'actor'),
    ).rejects.toThrow('at least one item');
    expect(invoiceRepo.save).not.toHaveBeenCalled();
    expect(itemRepo.remove).not.toHaveBeenCalled();
    expect(auditRepo.save).not.toHaveBeenCalled();
  });

  it('rejects edits when money was recorded even if the payment status is stale', async () => {
    const { service, invoice, invoiceRepo } = setup();
    invoice.amountReceived = '40.00';
    await expect(
      service.update(invoice.id, { remarks: 'No change' }, 'actor'),
    ).rejects.toThrow('recorded payments');
    expect(invoiceRepo.save).not.toHaveBeenCalled();
  });

  it.each([InvoiceType.PROFORMA, InvoiceType.CREDIT_NOTE])(
    'rejects changing the assigned type to %s',
    async (invoiceType) => {
      const { service, invoice, invoiceRepo, itemRepo, auditRepo } = setup();
      await expect(
        service.update(invoice.id, { invoiceType }, 'actor'),
      ).rejects.toThrow('Invoice type cannot change');
      expect(invoiceRepo.save).not.toHaveBeenCalled();
      expect(itemRepo.remove).not.toHaveBeenCalled();
      expect(auditRepo.save).not.toHaveBeenCalled();
    },
  );

  it.each(['2026-03-31', '2027-04-01', 'invalid'])(
    'rejects a date outside the assigned financial year: %s',
    async (invoiceDate) => {
      const { service, invoice, invoiceRepo } = setup();
      await expect(
        service.update(invoice.id, { invoiceDate }, 'actor'),
      ).rejects.toThrow('financial year 2026-27');
      expect(invoiceRepo.save).not.toHaveBeenCalled();
    },
  );

  it.each(['2026-04-01', '2027-03-31', '2026-09-27'])(
    'allows same-year dates and unchanged invoice type: %s',
    async (invoiceDate) => {
      const { service, invoice } = setup();
      await service.update(
        invoice.id,
        { invoiceDate, invoiceType: InvoiceType.TAX_INVOICE },
        'actor',
      );
      expect(invoice.invoiceDate).toBe(invoiceDate);
      expect(invoice.financialYear).toBe('2026-27');
      expect(invoice.invoiceType).toBe(InvoiceType.TAX_INVOICE);
    },
  );

  it('does not silently repair legacy financial years during an unrelated edit', async () => {
    const { service, invoice } = setup();
    invoice.financialYear = '2025-26';
    await service.update(invoice.id, { remarks: 'Metadata only' }, 'actor');
    expect(invoice.financialYear).toBe('2025-26');
  });
});
