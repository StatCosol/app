import { Invoice, InvoiceAuditLog, InvoiceItem } from '../entities';
import {
  InvoiceStatus,
  InvoiceType,
  MailStatus,
  PaymentStatus,
} from '../enums';
import { InvoicesService } from './invoices.service';

describe('InvoicesService Proforma conversion', () => {
  it('creates one separately numbered Tax Invoice with Proforma and PO references', async () => {
    const proforma = {
      id: 'proforma-id',
      tenantId: 'tenant-id',
      billingClientId: 'client-id',
      billingClient: { paymentTermsDays: 15 },
      invoiceType: InvoiceType.PROFORMA,
      invoiceNumber: 'STSPI/2627/0007',
      invoiceDate: '2026-07-20',
      invoiceStatus: InvoiceStatus.GENERATED,
      paymentStatus: PaymentStatus.UNPAID,
      placeOfSupply: 'Telangana',
      stateCode: '36',
      gstin: '36ABCDE1234F1Z5',
      subTotal: 1000,
      discountTotal: 0,
      taxableValue: 1000,
      cgstRate: 9,
      cgstAmount: 90,
      sgstRate: 9,
      sgstAmount: 90,
      igstRate: 0,
      igstAmount: 0,
      totalGst: 180,
      roundOff: 0,
      grandTotal: 1180,
      remarks: 'Monthly services',
      items: [
        {
          serviceDescription: 'Compliance services',
          quantity: 1,
          rate: 1000,
          amount: 1000,
          discountAmount: 0,
          taxableAmount: 1000,
          gstRate: 18,
          gstAmount: 180,
          lineTotal: 1180,
          isReimbursement: false,
          sequence: 1,
        },
      ],
    };
    const lockedProforma = {
      ...proforma,
      billingClient: undefined,
      items: undefined,
    };

    const transactionInvoiceRepo = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(lockedProforma)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(proforma),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id: 'tax-invoice-id' })),
    };
    const transactionItemRepo = {
      create: jest.fn((value) => value),
    };
    const transactionAuditRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === Invoice) return transactionInvoiceRepo;
        if (entity === InvoiceItem) return transactionItemRepo;
        if (entity === InvoiceAuditLog) return transactionAuditRepo;
        throw new Error('Unexpected repository');
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (callback) => callback(manager)),
    };
    const numberService = {
      generateInvoiceNumber: jest
        .fn()
        .mockResolvedValue('STSINV/2627/0012'),
      getFinancialYear: jest.fn().mockReturnValue('2026-27'),
    };

    const service = new InvoicesService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      numberService as any,
      dataSource as any,
    );
    const result = {
      id: 'tax-invoice-id',
      invoiceType: InvoiceType.TAX_INVOICE,
      invoiceNumber: 'STSINV/2627/0012',
    };
    jest.spyOn(service, 'findOne').mockResolvedValue(result as any);

    await expect(
      service.convertProformaToTaxInvoice(
        proforma.id,
        {
          purchaseOrderNumber: ' PO-CLIENT-42 ',
          invoiceDate: '2026-07-31',
        },
        'user-id',
      ),
    ).resolves.toBe(result);

    expect(numberService.generateInvoiceNumber).toHaveBeenCalledWith(
      InvoiceType.TAX_INVOICE,
      '2026-07-31',
      manager,
    );
    expect(transactionInvoiceRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceType: InvoiceType.TAX_INVOICE,
        invoiceNumber: 'STSINV/2627/0012',
        invoiceDate: '2026-07-31',
        dueDate: '2026-08-15',
        invoiceStatus: InvoiceStatus.DRAFT,
        paymentStatus: PaymentStatus.UNPAID,
        mailStatus: MailStatus.NOT_SENT,
        proformaReferenceNumber: 'STSPI/2627/0007',
        purchaseOrderNumber: 'PO-CLIENT-42',
        convertedFromProformaId: 'proforma-id',
      }),
    );
    expect(transactionAuditRepo.save).toHaveBeenCalledTimes(1);
  });
});

