import { operationalDate, addCalendarDays } from './operational-date';
import { MinimumWageService } from '../contractor/contractor-employees/minimum-wage.service';
import { StateSlabService } from '../payroll/services/state-slab.service';
import { AttendanceController } from '../attendance/attendance.controller';
import { InvoicesService } from '../accounts-billing/services/invoices.service';
import {
  InvoiceType,
  InvoiceStatus,
  PaymentStatus,
} from '../accounts-billing/enums';
import { PayrollFnfService } from '../payroll/payroll-fnf.service';
import { generateFnfPdfBuffer } from '../payroll/utils/fnf-pdf';

jest.mock('../payroll/utils/fnf-pdf', () => ({
  generateFnfPdfBuffer: jest.fn(async () => Buffer.from('TEST PDF')),
}));

describe('Indian business dates around midnight', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-31T18:30:00.000Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it.each([
    ['2026-03-31T18:29:59.999Z', '2026-03-31'],
    ['2026-03-31T18:30:00.000Z', '2026-04-01'],
    ['2026-04-01T00:00:00.000Z', '2026-04-01'],
    ['2026-12-31T18:30:00.000Z', '2027-01-01'],
  ])('uses the Indian calendar date at %s', (instant, expected) => {
    expect(operationalDate(new Date(instant))).toBe(expected);
  });

  it('keeps due-soon windows on the same calendar as today', () => {
    expect(addCalendarDays(operationalDate(), 7)).toBe('2026-04-08');
  });

  it('looks up minimum wages with the Indian date and preserves explicit periods', async () => {
    const qb: any = {};
    for (const method of ['where', 'andWhere', 'orderBy', 'addOrderBy'])
      qb[method] = jest.fn().mockReturnValue(qb);
    qb.getOne = jest.fn(async () => null);
    const svc = new MinimumWageService({ createQueryBuilder: () => qb } as any);
    await svc.lookup('TS', 'SKILLED');
    expect(qb.andWhere).toHaveBeenCalledWith('mw.effective_from <= :dateStr', {
      dateStr: '2026-04-01',
    });
    await svc.lookup('TS', 'SKILLED', '2026-03-01');
    expect(qb.andWhere).toHaveBeenCalledWith('mw.effective_from <= :dateStr', {
      dateStr: '2026-03-01',
    });
  });

  it('selects the new statutory slab at midnight IST while keeping historical payroll rates', async () => {
    const rows = [
      {
        fromAmount: '0',
        toAmount: null,
        valueAmount: '100',
        effectiveFrom: '2025-04-01',
        effectiveTo: '2026-03-31',
      },
      {
        fromAmount: '0',
        toAmount: null,
        valueAmount: '200',
        effectiveFrom: '2026-04-01',
        effectiveTo: null,
      },
    ];
    const svc = new StateSlabService({ find: async () => rows } as any);
    const input = {
      clientId: 'test-client',
      stateCode: 'TS',
      componentCode: 'PT',
      baseAmount: 10000,
    };
    await expect(svc.resolveAmount(input)).resolves.toBe(200);
    await expect(
      svc.resolveAmount({ ...input, asOfDate: '2026-03-31' }),
    ).resolves.toBe(100);
  });

  it('runs attendance mismatch detection for the Indian day unless a date is supplied', () => {
    const svc = { persistMismatchesForDate: jest.fn() };
    const controller = Object.assign(
      Object.create(AttendanceController.prototype),
      { svc },
    );
    controller.runMismatchDetection({ clientId: 'test-client' });
    expect(svc.persistMismatchesForDate).toHaveBeenCalledWith(
      'test-client',
      '2026-04-01',
    );
    controller.runMismatchDetection({ clientId: 'test-client' }, '2026-03-01');
    expect(svc.persistMismatchesForDate).toHaveBeenCalledWith(
      'test-client',
      '2026-03-01',
    );
  });

  it.each([undefined, '2026-03-15'])(
    'dates tax invoice conversion correctly (explicit date %s)',
    async (invoiceDate) => {
      const proforma = {
        invoiceType: InvoiceType.PROFORMA,
        invoiceStatus: InvoiceStatus.DRAFT,
        paymentStatus: PaymentStatus.UNPAID,
      };
      const invoiceRepo = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(proforma)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(proforma),
      };
      const manager = { getRepository: () => invoiceRepo };
      const generateInvoiceNumber = jest.fn(async () => {
        throw Error('stop-before-write');
      });
      const svc = Object.assign(Object.create(InvoicesService.prototype), {
        dataSource: { transaction: async (fn) => fn(manager) },
        numberService: { generateInvoiceNumber },
      });
      await expect(
        svc.convertProformaToTaxInvoice(
          'test-invoice',
          { purchaseOrderNumber: 'TEST-ONLY', invoiceDate },
          'test-user',
        ),
      ).rejects.toThrow('stop-before-write');
      expect(generateInvoiceNumber).toHaveBeenCalledWith(
        InvoiceType.TAX_INVOICE,
        invoiceDate || '2026-04-01',
        manager,
      );
    },
  );

  it('issues the F&F document using the Indian date', async () => {
    const svc = Object.assign(Object.create(PayrollFnfService.prototype), {
      fnfRepo: {
        findOne: async () => ({
          clientId: 'test-client',
          employeeId: 'test-employee',
          settlementAmount: 100,
        }),
      },
      employeeRepo: {
        findOne: async () => ({ name: 'TEST ONLY', employeeCode: 'TEST-1' }),
      },
      clientRepo: { findOne: async () => null },
      computeFnfBreakup: async () => ({ pendingSalary: 100 }),
    });
    await svc.renderFnfDocumentPdf('test-fnf', 'SETTLEMENT_STATEMENT');
    expect(generateFnfPdfBuffer).toHaveBeenCalledWith(
      expect.objectContaining({ issueDate: '2026-04-01' }),
    );
  });
});
