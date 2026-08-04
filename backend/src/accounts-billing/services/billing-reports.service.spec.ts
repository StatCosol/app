import * as ExcelJS from 'exceljs';
import { InvoiceStatus, InvoiceType, PaymentStatus } from '../enums';
import { BillingReportsService } from './billing-reports.service';

describe('BillingReportsService', () => {
  const invoice = {
    id: 'invoice-id',
    billingClientId: 'client-id',
    invoiceType: InvoiceType.TAX_INVOICE,
    invoiceNumber: 'STSINV/2627/0001',
    invoiceDate: '2026-08-01',
    dueDate: '2026-08-31',
    financialYear: '2026-27',
    placeOfSupply: 'Telangana',
    stateCode: '36',
    gstin: '36AAAAA0000A1Z5',
    purchaseOrderNumber: 'PO-100',
    taxableValue: 1000,
    cgstAmount: 90,
    sgstAmount: 90,
    igstAmount: 0,
    grandTotal: 1180,
    amountReceived: 0,
    balanceOutstanding: 1180,
    invoiceStatus: InvoiceStatus.GENERATED,
    paymentStatus: PaymentStatus.UNPAID,
    billingClient: {
      billingCode: 'CLI-001',
      legalName: 'Example Client Pvt Ltd',
      gstin: '36BBBBB0000B1Z5',
      stateCode: '36',
      placeOfSupply: 'Telangana',
      defaultSacCode: '998311',
    },
    items: [
      {
        sequence: 1,
        serviceDescription: 'Monthly compliance services',
        sacCode: '998311',
        quantity: 1,
        rate: 1000,
        taxableAmount: 1000,
        gstRate: 18,
        gstAmount: 180,
        lineTotal: 1180,
      },
    ],
  } as any;

  function setup() {
    const qb: any = {
      leftJoinAndSelect: jest.fn(),
      orderBy: jest.fn(),
      addOrderBy: jest.fn(),
      andWhere: jest.fn(),
      getMany: jest.fn().mockResolvedValue([invoice]),
    };
    for (const method of [
      'leftJoinAndSelect',
      'orderBy',
      'addOrderBy',
      'andWhere',
    ]) {
      qb[method].mockReturnValue(qb);
    }
    const repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    return { service: new BillingReportsService(repo as any), qb };
  }

  it('returns GST detail only through the Tax Invoice and issued-status filters', async () => {
    const { service, qb } = setup();

    const report = await service.getReport({
      reportType: 'GST_DETAIL',
      fromDate: '2026-04-01',
      toDate: '2027-03-31',
    });

    expect(qb.andWhere).toHaveBeenCalledWith('inv.invoice_type = :taxInvoice', {
      taxInvoice: InvoiceType.TAX_INVOICE,
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      'inv.invoice_status IN (:...issuedStatuses)',
      expect.objectContaining({
        issuedStatuses: expect.not.arrayContaining([
          InvoiceStatus.DRAFT,
          InvoiceStatus.CANCELLED,
        ]),
      }),
    );
    expect(report.rows).toEqual([
      expect.objectContaining({
        invoiceDescription: 'Monthly compliance services',
        sacHsn: '998311',
        taxableValue: 1000,
        cgstAmount: 90,
        sgstAmount: 90,
        igstAmount: 0,
      }),
    ]);
    expect(report.summary).toEqual(
      expect.objectContaining({ invoiceCount: 1, gstAmount: 180 }),
    );
  });

  it('creates a formatted workbook with summary, filters and formula totals', async () => {
    const { service } = setup();

    const exported = await service.exportReport({ reportType: 'GST_DETAIL' });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported.buffer as any);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Summary',
      'Report Data',
    ]);
    const data = workbook.getWorksheet('Report Data')!;
    expect(data.getRow(1).values).toEqual(
      expect.arrayContaining([
        'Invoice #',
        'Invoice Description',
        'SAC/HSN',
        'Taxable Value',
      ]),
    );
    expect(data.views[0]).toEqual(
      expect.objectContaining({ state: 'frozen', ySplit: 1 }),
    );
    expect(data.getRow(3).getCell(13).formula).toContain('SUBTOTAL(109');
    expect(exported.fileName).toMatch(/^gst-detail-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});
