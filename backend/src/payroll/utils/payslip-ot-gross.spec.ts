import PDFDocument from 'pdfkit';
import { generatePayslipPdfBuffer, payslipOtherEarnings } from './payslip-pdf';
import { PayslipGeneratorService } from '../services/payslip-generator.service';

// Values from the 2026-11-26 smoke run: fixed 20,000, 30 OT hours (5,769)
// and one approved holiday day (769). The engine's GROSS already includes
// both, so the payslip must show Gross 26,538, not 32,307.
const values = {
  BASIC: 15000,
  HRA: 5000,
  OT_AMOUNT: 5769,
  HOLIDAY_DBL_AMOUNT: 769,
  GROSS: 26538,
  PF_EMP: 1800,
  ESI_EMP: 200,
  ESI_ER: 863,
  NET_PAY: 24538,
};

async function render(renderer: string, cv: Record<string, number>) {
  if (renderer === 'download') {
    return generatePayslipPdfBuffer({
      header: { periodYear: 2026, periodMonth: 10, employeeName: 'TEST ONLY' },
      componentValues: cv,
    });
  }
  const svc = Object.create(PayslipGeneratorService.prototype);
  return svc.renderPayslipPdf({
    run: { periodYear: 2026, periodMonth: 10 },
    runEmp: {
      employeeName: 'TEST ONLY',
      employeeCode: 'TEST',
      netPay: cv.NET_PAY,
    },
    client: null,
    employee: null,
    components: [],
    valueMap: new Map(Object.entries(cv)),
    layout: null,
  });
}

describe('payslip overtime and holiday wage', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(['download', 'archive'])(
    '%s shows OT and holiday wage once and gross equal to the run gross',
    async (renderer) => {
      const text = jest.spyOn(PDFDocument.prototype, 'text');
      const pdf = await render(renderer, values);
      const printed = text.mock.calls.map((call) => String(call[0]));
      expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
      expect(printed).toContain('Other Earnings (incl. OT, holiday)');
      expect(printed).toContain('Rs.6,538');
      expect(printed).toContain('Rs.26,538');
      expect(printed).toContain('Rs.24,538');
      expect(printed).not.toContain('Rs.12,307');
      expect(printed).not.toContain('Rs.32,307');
    },
  );

  it.each(['download', 'archive'])(
    '%s adds OT to an explicit other-earnings amount without inflating gross',
    async (renderer) => {
      const text = jest.spyOn(PDFDocument.prototype, 'text');
      await render(renderer, {
        BASIC: 15000,
        HRA: 5000,
        OTHER_EARNINGS: 1000,
        OT_AMOUNT: 2000,
        GROSS: 23000,
        PF_EMP: 1800,
        NET_PAY: 21200,
      });
      const printed = text.mock.calls.map((call) => String(call[0]));
      expect(printed).toContain('Rs.3,000');
      expect(printed).toContain('Rs.23,000');
      expect(printed).not.toContain('Rs.25,000');
    },
  );

  it('earnings rows add up to gross', () => {
    const base = {
      gross: 26538,
      basic: 15000,
      hra: 5000,
      others: 0,
      attBonus: 0,
      otherEarningsExplicit: 0,
      otAmount: 5769,
      holidayDblAmount: 769,
    };
    expect(payslipOtherEarnings(base).amount).toBe(6538);
    expect(
      payslipOtherEarnings({
        ...base,
        gross: 27538,
        otherEarningsExplicit: 1000,
      }).amount,
    ).toBe(7538);
    expect(
      payslipOtherEarnings({
        ...base,
        gross: 20000,
        otAmount: 0,
        holidayDblAmount: 0,
      }),
    ).toEqual({ amount: 0, notes: [] });
  });
});
