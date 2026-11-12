import PDFDocument from 'pdfkit';
import { generatePayslipPdfBuffer } from './payslip-pdf';
import { PayslipGeneratorService } from '../services/payslip-generator.service';

describe('payslip LWF breakdown', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(['download', 'archive'])(
    '%s includes LWF and reconciles deductions with net pay',
    async (renderer) => {
      const text = jest.spyOn(PDFDocument.prototype, 'text');
      const values = {
        BASIC: 15000,
        HRA: 5000,
        GROSS: 20000,
        PF_EMP: 1800,
        ESI_EMP: 150,
        PT: 150,
        LWF_EMP: 2,
        LWF_ER: 5,
        NET_PAY: 17898,
      };
      let pdf: Buffer;
      if (renderer === 'download') {
        pdf = await generatePayslipPdfBuffer({
          header: {
            periodYear: 2025,
            periodMonth: 12,
            employeeName: 'TEST ONLY',
          },
          componentValues: values,
        });
      } else {
        const svc = Object.create(PayslipGeneratorService.prototype);
        pdf = await svc.renderPayslipPdf({
          run: { periodYear: 2025, periodMonth: 12 },
          runEmp: {
            employeeName: 'TEST ONLY',
            employeeCode: 'TEST',
            netPay: 17898,
          },
          client: null,
          employee: null,
          components: [],
          valueMap: new Map(Object.entries(values)),
          layout: null,
        });
      }
      const printed = text.mock.calls.map((call) => String(call[0]));
      expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
      expect(printed).toContain('LWF');
      expect(printed).toContain('Rs.2,102');
      expect(printed).toContain('Rs.17,898');
      expect(printed).toContain('LWF Employer: Rs.5');
      expect(printed).not.toContain('Rs.2,100');
    },
  );

  it('keeps exempt employees free of LWF deductions', async () => {
    const text = jest.spyOn(PDFDocument.prototype, 'text');
    await generatePayslipPdfBuffer({
      header: { periodYear: 2025, periodMonth: 12 },
      componentValues: { GROSS: 20000, PF_EMP: 1800, ESI_EMP: 150, PT: 150 },
    });
    const printed = text.mock.calls.map((call) => String(call[0]));
    expect(printed).not.toContain('LWF');
    expect(printed).toContain('Rs.2,100');
    expect(printed).toContain('Rs.17,900');
  });
});
