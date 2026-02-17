import PDFDocument from 'pdfkit';

export type PayslipPdfInput = {
  header: {
    periodYear: number;
    periodMonth: number;
    clientName?: string | null;
    employeeName?: string | null;
    empCode?: string | null;
    designation?: string | null;
    uan?: string | null;
    esic?: string | null;
  };
  payslip: {
    sections: Array<{
      key: string;
      title: string;
      rows: Array<any>;
      totals?: Array<any>;
    }>;
    totals: Record<string, number>;
  };
};

function fmtMoney(n: any) {
  const v = Number(n ?? 0);
  return v.toFixed(2);
}

export async function generatePayslipPdfBuffer(
  input: PayslipPdfInput,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });

      const chunks: Buffer[] = [];
      doc.on('data', (d) => chunks.push(d));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Title
      doc.fontSize(16).text('PAYSLIP', { align: 'center' });
      doc.moveDown(0.5);

      // Header
      doc.fontSize(11);
      doc.text(
        `Period: ${String(input.header.periodMonth).padStart(2, '0')}/${input.header.periodYear}`,
      );
      if (input.header.clientName)
        doc.text(`Client: ${input.header.clientName}`);
      if (input.header.employeeName)
        doc.text(`Employee: ${input.header.employeeName}`);
      if (input.header.empCode) doc.text(`Emp Code: ${input.header.empCode}`);
      if (input.header.designation)
        doc.text(`Designation: ${input.header.designation}`);
      if (input.header.uan) doc.text(`UAN: ${input.header.uan}`);
      if (input.header.esic) doc.text(`ESIC: ${input.header.esic}`);

      doc.moveDown(0.8);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.8);

      // Sections
      for (const sec of input.payslip.sections || []) {
        doc.fontSize(12).text(sec.title || sec.key, { underline: true });
        doc.moveDown(0.4);

        // Table header
        const startX = 40;
        const col1 = startX;
        const col2 = 450;

        doc.fontSize(10).text('Component', col1, doc.y);
        doc
          .fontSize(10)
          .text('Amount', col2, doc.y, { width: 100, align: 'right' });
        doc.moveDown(0.3);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.3);

        const rows = sec.rows || [];
        for (const r of rows) {
          if (r.type === 'COMPONENT') {
            doc.fontSize(10).text(r.label ?? r.code, col1, doc.y);
            doc.fontSize(10).text(fmtMoney(r.amount), col2, doc.y, {
              width: 100,
              align: 'right',
            });
            doc.moveDown(0.25);
          } else if (r.type === 'TOTAL') {
            doc.fontSize(10).text(r.label ?? r.key, col1, doc.y);
            doc.fontSize(10).text(fmtMoney(r.amount), col2, doc.y, {
              width: 100,
              align: 'right',
            });
            doc.moveDown(0.25);
          }
        }

        // Section totals
        const totals = sec.totals || [];
        if (totals.length) {
          doc.moveDown(0.2);
          doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
          doc.moveDown(0.2);
          for (const t of totals) {
            doc.fontSize(10).text(t.label ?? t.key, col1, doc.y);
            doc.fontSize(10).text(fmtMoney(t.amount), col2, doc.y, {
              width: 100,
              align: 'right',
            });
            doc.moveDown(0.25);
          }
        }

        doc.moveDown(0.6);

        // Page break safety
        if (doc.y > 740) doc.addPage();
      }

      // Summary totals block (optional)
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.6);
      doc.fontSize(12).text('Summary', { underline: true });
      doc.moveDown(0.4);

      const summaryOrder = [
        'GROSS_EARNINGS',
        'TOTAL_DEDUCTIONS',
        'NET_PAY',
        'CTC',
      ];
      for (const k of summaryOrder) {
        if (input.payslip.totals?.[k] == null) continue;
        doc.fontSize(10).text(k.replace(/_/g, ' '), 40, doc.y);
        doc.fontSize(10).text(fmtMoney(input.payslip.totals[k]), 450, doc.y, {
          width: 100,
          align: 'right',
        });
        doc.moveDown(0.25);
      }

      doc.end();
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}
