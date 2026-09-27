import { Invoice, InvoiceAuditLog, InvoiceItem } from '../entities';
import {
  InvoiceStatus,
  InvoiceType,
  MailStatus,
  PaymentStatus,
} from '../enums';
import { InvoicesService } from './invoices.service';

describe('InvoicesService Proforma conversion', () => {
  it('excludes proformas from receivable filters and dashboard amounts', async () => {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({}),
    };
    const invoiceRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const service = new InvoicesService(
      invoiceRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.findAll({ paymentStatus: PaymentStatus.UNPAID });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'inv.invoice_type != :proforma',
      { proforma: InvoiceType.PROFORMA },
    );

    await service.getDashboardStats();

    expect(queryBuilder.select).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.stringContaining('pendingPaymentCount'),
        expect.stringContaining('totalOutstanding'),
      ]),
    );
    const selectCalls = queryBuilder.select.mock.calls;
    const dashboardColumns = selectCalls[selectCalls.length - 1][0].join(' ');
    expect(dashboardColumns).toContain("invoice_type != 'PROFORMA'");
  });

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
      generateInvoiceNumber: jest.fn().mockResolvedValue('STSINV/2627/0012'),
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

describe('InvoicesService locked transitions', () => {
  function setup(overrides: Record<string, unknown> = {}) {
    const invoice = {
      id: 'invoice-id',
      invoiceStatus: InvoiceStatus.APPROVED,
      paymentStatus: PaymentStatus.UNPAID,
      amountReceived: 0,
      ...overrides,
    };
    const repository = {
      findOne: jest.fn().mockResolvedValue(invoice),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const manager = { getRepository: jest.fn().mockReturnValue(repository) };
    const dataSource = {
      transaction: jest.fn(async (callback) => callback(manager)),
    };
    const service = new InvoicesService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      dataSource as any,
    );
    jest.spyOn(service, 'findOne').mockResolvedValue(invoice as any);
    return { service, repository, dataSource };
  }

  it('approves only under the parent-row lock without resaving relations', async () => {
    const { service, repository, dataSource } = setup({
      invoiceStatus: InvoiceStatus.DRAFT,
    });
    await service.approve('invoice-id', 'approver');
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 'invoice-id' },
      lock: { mode: 'pessimistic_write' },
      loadEagerRelations: false,
    });
    expect(repository.update).toHaveBeenCalledWith('invoice-id', {
      invoiceStatus: InvoiceStatus.APPROVED,
      approvedBy: 'approver',
      approvedAt: expect.any(Date),
    });
  });

  it.each([
    InvoiceStatus.CANCELLED,
    InvoiceStatus.APPROVED,
    InvoiceStatus.PAID,
  ])(
    'rejects approval after the locked state becomes %s',
    async (invoiceStatus) => {
      const { service, repository } = setup({ invoiceStatus });
      await expect(service.approve('invoice-id', 'approver')).rejects.toThrow(
        'Only DRAFT',
      );
      expect(repository.update).not.toHaveBeenCalled();
    },
  );

  it.each([
    { invoiceStatus: InvoiceStatus.PAID },
    { invoiceStatus: InvoiceStatus.PARTIALLY_PAID },
    { paymentStatus: PaymentStatus.PARTIALLY_PAID },
    { amountReceived: '40.00' },
  ])('rejects cancellation with recorded money: %j', async (overrides) => {
    const { service, repository } = setup(overrides);
    await expect(service.cancel('invoice-id')).rejects.toThrow('Cannot cancel');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('cancels an unpaid invoice using a status-only update', async () => {
    const { service, repository } = setup();
    await service.cancel('invoice-id');
    expect(repository.update).toHaveBeenCalledWith('invoice-id', {
      invoiceStatus: InvoiceStatus.CANCELLED,
    });
  });

  it.each(Object.values(InvoiceStatus))(
    'preserves PDF transition rules for %s',
    async (invoiceStatus) => {
      const { service, repository } = setup({ invoiceStatus });
      await service.updatePdfPath('invoice-id', 'invoice.pdf');
      const transitions = [
        InvoiceStatus.DRAFT,
        InvoiceStatus.APPROVED,
      ].includes(invoiceStatus);
      expect(repository.update).toHaveBeenCalledWith('invoice-id', {
        pdfPath: 'invoice.pdf',
        ...(transitions ? { invoiceStatus: InvoiceStatus.GENERATED } : {}),
      });
    },
  );

  it.each(['approve', 'cancel', 'updatePdfPath', 'update'] as const)(
    '%s returns not found without writing when the locked invoice is missing',
    async (operation) => {
      const { service, repository } = setup();
      repository.findOne.mockResolvedValue(null);
      const request =
        operation === 'update'
          ? service.update('missing', {}, 'actor')
          : operation === 'cancel'
            ? service.cancel('missing')
            : service[operation]('missing', 'value');
      await expect(request).rejects.toThrow('Invoice not found');
      expect(repository.update).not.toHaveBeenCalled();
    },
  );
});
