import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Loads a client logo file and returns a Buffer suitable for PDFKit doc.image().
 * Handles SVG files that wrap embedded JPEG/PNG base64 data.
 * Returns null if the file doesn't exist or can't be parsed.
 */
export function loadLogoBuffer(logoUrl: string | null | undefined): Buffer | null {
  if (!logoUrl) return null;
  try {
    const filePath = logoUrl.startsWith('/')
      ? path.join(process.cwd(), logoUrl)
      : logoUrl;
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath);
    const str = raw.toString('utf-8', 0, Math.min(raw.length, 500));
    // If it's an SVG wrapping a base64 image, extract the image data
    if (str.trimStart().startsWith('<svg') || str.trimStart().startsWith('<?xml')) {
      const full = raw.toString('utf-8');
      const m = full.match(/href="data:image\/(jpeg|png|webp);base64,([^"]+)"/);
      if (m) {
        return Buffer.from(m[2], 'base64');
      }
      return null; // pure SVG, not supported by PDFKit
    }
    return raw; // JPEG/PNG file
  } catch {
    return null;
  }
}

export type PayslipPdfInput = {
  header: {
    periodYear: number;
    periodMonth: number;
    clientName?: string | null;
    clientAddress?: string | null;
    employeeName?: string | null;
    empCode?: string | null;
    designation?: string | null;
    dateOfJoining?: string | null;
    uan?: string | null;
    esic?: string | null;
    logoBuffer?: Buffer | null;
  };
  componentValues: Record<string, number>;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatCurrency(n: number): string {
  return 'Rs.' + Math.round(n).toLocaleString('en-IN');
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

      const startX = 40;
      const pageWidth = doc.page.width - 80;
      const cv = input.componentValues;

      // ── Logo above Company Name ──
      if (input.header.logoBuffer) {
        try {
          const logoFitW = 80;
          const logoFitH = 40;
          const logoX = (doc.page.width - logoFitW) / 2;
          const logoY = doc.y;
          doc.image(input.header.logoBuffer, logoX, logoY, {
            fit: [logoFitW, logoFitH],
            align: 'center',
            valign: 'center',
          });
          doc.y = logoY + logoFitH + 6;
        } catch {
          // skip logo if unsupported format
        }
      }

      doc.fontSize(16).font('Helvetica-Bold').fillColor('#000000').text(
        (input.header.clientName ?? 'Company').toUpperCase(),
        startX, doc.y, { align: 'center', width: pageWidth },
      );
      doc.moveDown(0.2);

      if (input.header.clientAddress) {
        doc.fontSize(8).font('Helvetica').fillColor('#333333').text(
          input.header.clientAddress,
          startX, doc.y, { align: 'center', width: pageWidth },
        );
        doc.moveDown(0.4);
      }

      // ── Title: PAYSLIP ──
      doc.moveDown(0.3);
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000').text(
        'PAYSLIP', startX, doc.y, { align: 'center', width: pageWidth, underline: true },
      );
      doc.moveDown(1);

      // ── Employee Info ──
      const infoLabelWidth = 120;
      const leftCol = startX;
      const rightCol = startX + pageWidth / 2 + 20;
      let infoY = doc.y;
      const infoFontSize = 10;

      // Row 1: Employee Name
      doc.fontSize(infoFontSize).font('Helvetica').fillColor('#000000')
        .text('Employee Name:', leftCol, infoY);
      doc.text(input.header.employeeName || '_______________', leftCol + infoLabelWidth, infoY);
      infoY += 18;

      // Row 2: Employee ID + Designation
      doc.text('Employee ID:', leftCol, infoY);
      doc.text(input.header.empCode || '_______________', leftCol + infoLabelWidth, infoY);
      doc.text('Designation:', rightCol, infoY);
      doc.text(input.header.designation || '_______________', rightCol + 100, infoY);
      infoY += 18;

      // Row 3: Month + Date of Joining
      const periodLabel = `${MONTH_NAMES[input.header.periodMonth - 1]} ${input.header.periodYear}`;
      doc.text('Month:', leftCol, infoY);
      doc.text(periodLabel, leftCol + infoLabelWidth, infoY);
      doc.text('Date of Joining:', rightCol, infoY);
      const doj = input.header.dateOfJoining
        ? new Date(input.header.dateOfJoining).toLocaleDateString('en-IN')
        : '_______________';
      doc.text(doj, rightCol + 100, infoY);
      infoY += 18;

      // Row 4: UAN + ESIC
      if (input.header.uan || input.header.esic) {
        doc.text('UAN:', leftCol, infoY);
        doc.text(input.header.uan || '_______________', leftCol + infoLabelWidth, infoY);
        doc.text('ESIC:', rightCol, infoY);
        doc.text(input.header.esic || '_______________', rightCol + 100, infoY);
        infoY += 18;
      }

      // ── Attendance / Leave Summary ──
      const workedDays = cv['WORKED_DAYS'] ?? 0;
      const payableDays = cv['PAYABLE_DAYS'] ?? 0;
      const lopDays = cv['LOP_DAYS'] ?? 0;
      const holidays = cv['HOLIDAYS'] ?? 0;
      const elPaidLeaveDays = cv['EL_PAID_LEAVE_DAYS'] ?? 0;
      const leaveEarned = cv['EL_ACCRUED'] ?? 0;
      doc.text('Days Worked:', leftCol, infoY);
      doc.text(String(workedDays), leftCol + infoLabelWidth, infoY);
      doc.text('Payable Days:', rightCol, infoY);
      doc.text(String(payableDays), rightCol + 100, infoY);
      infoY += 18;

      doc.text('Holidays:', leftCol, infoY);
      doc.text(String(holidays), leftCol + infoLabelWidth, infoY);
      doc.text('LOP Days:', rightCol, infoY);
      doc.text(String(lopDays), rightCol + 100, infoY);
      infoY += 18;

      doc.text('Leave Earned:', leftCol, infoY);
      doc.text(String(leaveEarned), leftCol + infoLabelWidth, infoY);
      doc.text('Leave Paid:', rightCol, infoY);
      doc.text(String(elPaidLeaveDays), rightCol + 100, infoY);
      infoY += 18;

      const elBalance = cv['EL_BALANCE'] ?? 0;
      doc.text('Leave Balance:', leftCol, infoY);
      doc.text(String(elBalance), leftCol + infoLabelWidth, infoY);
      infoY += 24;

      doc.y = infoY;

      // ── Compute earnings breakdown ──
      const basic = cv['BASIC'] ?? 0;
      const hra = cv['HRA'] ?? 0;
      const others = cv['OTHERS'] ?? 0;
      const attBonus = cv['ATT_BONUS'] ?? 0;
      const gross = cv['GROSS'] ?? 0;
      // Other Earnings = everything in gross not covered by the four named components
      const otherEarningsRow = Math.max(0, gross - basic - hra - others - attBonus);

      // ── Compute deductions summary ──
      const pfAmt = cv['PF_EMP'] ?? 0;
      const esiAmt = cv['ESI_EMP'] ?? 0;
      const ptAmt = cv['PT'] ?? 0;
      const pfErFromEmpAmt = cv['PF_ER_FROM_EMP'] ?? 0;
      const totalDeduction = pfAmt + esiAmt + ptAmt + pfErFromEmpAmt;
      const netPay = cv['NET_PAY'] ?? (gross - totalDeduction);

      // ── Draw Table ──
      const tableX = startX;
      const tableWidth = pageWidth;
      const halfWidth = tableWidth / 2;
      const col1X = tableX;
      const col3X = tableX + halfWidth;
      const rowHeight = 24;
      const cellPadX = 6;
      const cellPadY = 7;
      let tY = doc.y;

      const drawCellBorders = (x: number, y: number, w: number, h: number) => {
        doc.strokeColor('#000000').lineWidth(0.5).rect(x, y, w, h).stroke();
      };

      const drawRow = (
        label1: string, val1: string,
        label2: string, val2: string,
        y: number, bold = false,
      ) => {
        const labelW = halfWidth - 80;
        const amtW = 80;
        drawCellBorders(col1X, y, labelW, rowHeight);
        drawCellBorders(col1X + labelW, y, amtW, rowHeight);
        drawCellBorders(col3X, y, labelW, rowHeight);
        drawCellBorders(col3X + labelW, y, amtW, rowHeight);

        const fs = bold ? 10 : 9;
        doc.fontSize(fs).fillColor('#000000');
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
        doc.text(label1, col1X + cellPadX, y + cellPadY, { width: labelW - cellPadX * 2 });
        doc.text(val1, col1X + labelW + cellPadX, y + cellPadY, { width: amtW - cellPadX * 2, align: 'right' });
        doc.text(label2, col3X + cellPadX, y + cellPadY, { width: labelW - cellPadX * 2 });
        doc.text(val2, col3X + labelW + cellPadX, y + cellPadY, { width: amtW - cellPadX * 2, align: 'right' });
        doc.font('Helvetica');
      };

      // Header row
      drawRow('Earnings', 'Amount', 'Deductions', 'Amount', tY, true);
      tY += rowHeight;
      // Basic / PF
      drawRow('Basic', formatCurrency(basic), 'PF', formatCurrency(pfAmt), tY);
      tY += rowHeight;
      // HRA / ESI
      drawRow('HRA', formatCurrency(hra), 'ESI', formatCurrency(esiAmt), tY);
      tY += rowHeight;
      // Others / PT
      drawRow('Others', formatCurrency(others), 'PT', formatCurrency(ptAmt), tY);
      tY += rowHeight;

      // Att. Bonus row — paired with PF Employer if applicable
      if (attBonus > 0 || pfErFromEmpAmt > 0) {
        drawRow(
          attBonus > 0 ? 'Att. Bonus' : '', attBonus > 0 ? formatCurrency(attBonus) : '',
          pfErFromEmpAmt > 0 ? 'PF Employer' : '', pfErFromEmpAmt > 0 ? formatCurrency(pfErFromEmpAmt) : '',
          tY,
        );
        tY += rowHeight;
      }

      // Other Earnings (catch-all: includes Arrear Att. Bonus, Other Earnings, etc.)
      if (otherEarningsRow > 0) {
        drawRow('Other Earnings', formatCurrency(otherEarningsRow), '', '', tY);
        tY += rowHeight;
      }

      // Gross / Total Deduction
      drawRow('Gross', formatCurrency(gross), 'Total Deduction', formatCurrency(totalDeduction), tY, true);
      tY += rowHeight;

      // Net Pay row
      const netLabelW = halfWidth - 80;
      const netAmtW = 80;
      drawCellBorders(col1X, tY, netLabelW, rowHeight);
      drawCellBorders(col1X + netLabelW, tY, netAmtW, rowHeight);
      drawCellBorders(col3X, tY, halfWidth, rowHeight);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000')
        .text('Net Pay', col1X + cellPadX, tY + cellPadY, { width: netLabelW - cellPadX * 2 });
      doc.text(formatCurrency(netPay), col1X + netLabelW + cellPadX, tY + cellPadY, {
        width: netAmtW - cellPadX * 2, align: 'right',
      });
      doc.font('Helvetica');
      tY += rowHeight;
      doc.y = tY + 20;

      // ── Employer Contributions ──
      // When PF_ER_FROM_EMP > 0 the employer PF is already deducted from the
      // employee's salary, so we do NOT show it again as an employer contribution.
      const pfEr = cv['PF_ER'] ?? 0;
      const esiEr = cv['ESI_ER'] ?? 0;
      const pfErFromEmp = cv['PF_ER_FROM_EMP'] ?? 0;
      const showPfEr = pfEr > 0 && pfErFromEmp === 0;
      if (showPfEr || esiEr > 0) {
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000')
          .text('Employer Contributions:', startX, doc.y);
        doc.font('Helvetica').moveDown(0.4);
        if (showPfEr) {
          doc.fontSize(10).text(`PF Employer: ${formatCurrency(pfEr)}`, startX, doc.y);
          doc.moveDown(0.3);
        }
        if (esiEr > 0) {
          doc.fontSize(10).text(`ESI Employer: ${formatCurrency(esiEr)}`, startX, doc.y);
          doc.moveDown(0.3);
        }
      }

      // ── Authorized Signatory ──
      doc.moveDown(3);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000')
        .text('Authorized Signatory', startX, doc.y);
      doc.font('Helvetica');

      doc.end();
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}
