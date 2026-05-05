import PDFDocument from 'pdfkit';
import { loadLogoBuffer } from './payslip-pdf';

export type FnfDocType =
  | 'SETTLEMENT_STATEMENT'
  | 'RELIEVING_LETTER'
  | 'EXPERIENCE_CERTIFICATE'
  | 'NO_DUES_CERTIFICATE';

export interface FnfPdfInput {
  docType: FnfDocType;
  client: {
    name: string;
    address?: string | null;
    logoUrl?: string | null;
  };
  employee: {
    name: string;
    employeeCode: string;
    designation?: string | null;
    department?: string | null;
    fatherName?: string | null;
    dateOfJoining?: string | null;
    pan?: string | null;
    uan?: string | null;
  };
  separation: {
    separationDate: string;
    lastWorkingDay?: string | null;
    reason?: string | null;
  };
  settlement: {
    pendingSalary: number;
    leaveEncashment: number;
    bonusArrears: number;
    deductions: number;
    recoveries: number;
    netAmount: number;
  };
  issueDate: string; // ISO yyyy-mm-dd
  remarks?: string | null;
}

const INR = (n: number) =>
  'Rs. ' + Math.ceil(Number(n) || 0).toLocaleString('en-IN');

function fmtDate(d?: string | null): string {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function resetX(doc: PDFKit.PDFDocument) {
  doc.x = doc.page.margins.left;
}

function drawHeader(
  doc: PDFKit.PDFDocument,
  client: FnfPdfInput['client'],
  title: string,
) {
  const logo = loadLogoBuffer(client.logoUrl);
  if (logo) {
    try {
      const logoY = doc.y;
      doc.image(logo, (doc.page.width - 80) / 2, logoY, {
        fit: [80, 40],
        align: 'center',
        valign: 'center',
      });
      doc.y = logoY + 46;
    } catch {
      /* ignore */
    }
  }
  resetX(doc);
  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor('#000')
    .text((client.name || 'Company').toUpperCase(), {
      align: 'center',
    });
  if (client.address) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#444')
      .text(client.address, { align: 'center' });
  }
  doc.moveDown(0.7);
  resetX(doc);
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor('#000')
    .text(title, { align: 'center', underline: true });
  doc.moveDown(0.8);
  resetX(doc);
}

function drawFooter(
  doc: PDFKit.PDFDocument,
  client: FnfPdfInput['client'],
) {
  doc.moveDown(2);
  resetX(doc);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#000')
    .text('For ' + (client.name || 'Company'), { align: 'right' });
  doc.moveDown(2.5);
  doc.text('___________________________', { align: 'right' });
  doc.text('Authorised Signatory', { align: 'right' });
  resetX(doc);
}

function drawKeyValue(
  doc: PDFKit.PDFDocument,
  pairs: Array<[string, string]>,
) {
  const colW = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2;
  const startX = doc.page.margins.left;
  let y = doc.y;
  pairs.forEach(([k, v], idx) => {
    const col = idx % 2;
    if (col === 0 && idx > 0) y = doc.y;
    const x = startX + col * colW;
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#333')
      .text(k + ':', x, y, { width: colW, continued: false });
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#000')
      .text(v || '-', x + 110, y, { width: colW - 110 });
    if (col === 1) {
      doc.moveDown(0.3);
      resetX(doc);
    }
  });
  if (pairs.length % 2 === 1) {
    doc.moveDown(0.3);
    resetX(doc);
  }
}

function drawBreakupTable(
  doc: PDFKit.PDFDocument,
  s: FnfPdfInput['settlement'],
) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const tableW = right - left;
  const labelW = tableW * 0.65;
  const valueW = tableW - labelW;
  const rowH = 22;

  const rows: Array<[string, number, 'add' | 'sub' | 'total']> = [
    ['Pending Salary (Pro-rated)', s.pendingSalary, 'add'],
    ['Leave Encashment', s.leaveEncashment, 'add'],
    ['Bonus / Arrears', s.bonusArrears, 'add'],
    ['Less: Deductions', s.deductions, 'sub'],
    ['Less: Recoveries', s.recoveries, 'sub'],
  ];

  // Header
  let y = doc.y;
  doc.rect(left, y, tableW, rowH).fillAndStroke('#f0f0f0', '#999');
  doc
    .fillColor('#000')
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('Component', left + 8, y + 6, { width: labelW - 16 })
    .text('Amount (INR)', left + labelW, y + 6, {
      width: valueW - 8,
      align: 'right',
    });
  y += rowH;

  rows.forEach(([label, amt, kind]) => {
    doc.rect(left, y, tableW, rowH).stroke('#bbb');
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#000')
      .text(label, left + 8, y + 6, { width: labelW - 16 });
    const display = (kind === 'sub' ? '- ' : '') + INR(amt);
    doc.text(display, left + labelW, y + 6, {
      width: valueW - 8,
      align: 'right',
    });
    y += rowH;
  });

  // Total
  doc.rect(left, y, tableW, rowH).fillAndStroke('#e8f4ff', '#3a72b8');
  doc
    .fillColor('#000')
    .font('Helvetica-Bold')
    .fontSize(11)
    .text('Net Settlement Amount', left + 8, y + 6, { width: labelW - 16 })
    .text(INR(s.netAmount), left + labelW, y + 6, {
      width: valueW - 8,
      align: 'right',
    });
  y += rowH;

  doc.y = y + 8;
  resetX(doc);
}

export async function generateFnfPdfBuffer(
  input: FnfPdfInput,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 50, right: 50 },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      switch (input.docType) {
        case 'SETTLEMENT_STATEMENT':
          renderSettlementStatement(doc, input);
          break;
        case 'RELIEVING_LETTER':
          renderRelievingLetter(doc, input);
          break;
        case 'EXPERIENCE_CERTIFICATE':
          renderExperienceCertificate(doc, input);
          break;
        case 'NO_DUES_CERTIFICATE':
          renderNoDuesCertificate(doc, input);
          break;
        default:
          renderSettlementStatement(doc, input);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function renderSettlementStatement(
  doc: PDFKit.PDFDocument,
  input: FnfPdfInput,
) {
  drawHeader(doc, input.client, 'Full & Final Settlement Statement');

  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#000')
    .text('Date of Issue: ' + fmtDate(input.issueDate), { align: 'right' });
  doc.moveDown(0.5);
  resetX(doc);

  drawKeyValue(doc, [
    ['Employee Name', input.employee.name],
    ['Employee Code', input.employee.employeeCode],
    ['Designation', input.employee.designation || '-'],
    ['Department', input.employee.department || '-'],
    ['Date of Joining', fmtDate(input.employee.dateOfJoining)],
    ['Last Working Day', fmtDate(input.separation.lastWorkingDay || input.separation.separationDate)],
    ['Separation Reason', input.separation.reason || '-'],
    ['PAN', input.employee.pan || '-'],
  ]);

  doc.moveDown(0.5);
  resetX(doc);
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#000')
    .text('Settlement Breakup');
  doc.moveDown(0.3);
  resetX(doc);

  drawBreakupTable(doc, input.settlement);

  doc.moveDown(0.5);
  resetX(doc);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#555')
    .text(
      'Note: This statement reflects the final dues payable on full and final settlement. ' +
        'Please verify and acknowledge by signing below. Statutory deductions, if any, are inclusive.',
      { align: 'justify' },
    );

  if (input.remarks) {
    doc.moveDown(0.4);
    resetX(doc);
    doc
      .font('Helvetica-Oblique')
      .fontSize(9)
      .fillColor('#555')
      .text('Remarks: ' + input.remarks, { align: 'left' });
  }

  doc.moveDown(2);
  resetX(doc);
  const sigY = doc.y;
  const colW = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2;
  doc
    .font('Helvetica')
    .fontSize(10)
    .text('___________________________', doc.page.margins.left, sigY, {
      width: colW,
      align: 'left',
    })
    .text('Employee Signature', doc.page.margins.left, sigY + 14, {
      width: colW,
      align: 'left',
    });
  doc
    .text('___________________________', doc.page.margins.left + colW, sigY, {
      width: colW,
      align: 'right',
    })
    .text(
      'Authorised Signatory',
      doc.page.margins.left + colW,
      sigY + 14,
      { width: colW, align: 'right' },
    );
  resetX(doc);
}

function renderRelievingLetter(
  doc: PDFKit.PDFDocument,
  input: FnfPdfInput,
) {
  drawHeader(doc, input.client, 'Relieving Letter');

  doc
    .font('Helvetica')
    .fontSize(10)
    .text('Date: ' + fmtDate(input.issueDate), { align: 'right' });
  doc.moveDown(1);
  resetX(doc);

  doc
    .font('Helvetica')
    .fontSize(10)
    .text('To,')
    .text(input.employee.name)
    .text('Employee Code: ' + input.employee.employeeCode);
  doc.moveDown(0.8);
  resetX(doc);

  doc
    .font('Helvetica-Bold')
    .text('Subject: Relieving from the services of ' + input.client.name);
  doc.moveDown(0.6);
  resetX(doc);

  doc.font('Helvetica').text('Dear ' + input.employee.name + ',');
  doc.moveDown(0.4);
  resetX(doc);

  const lwd = fmtDate(input.separation.lastWorkingDay || input.separation.separationDate);
  const doj = fmtDate(input.employee.dateOfJoining);
  const body =
    'This is to confirm that you have been relieved from the services of ' +
    input.client.name +
    ' with effect from the close of business on ' +
    lwd +
    '. You were associated with us as ' +
    (input.employee.designation || 'an employee') +
    ' from ' +
    doj +
    ' till ' +
    lwd +
    '. Your full and final settlement has been processed and a separate settlement statement has been issued.\n\n' +
    'We thank you for your contribution during your tenure with us and wish you the very best for your future endeavours.';
  doc.text(body, { align: 'justify', lineGap: 2 });
  doc.moveDown(1);
  resetX(doc);

  drawFooter(doc, input.client);
}

function renderExperienceCertificate(
  doc: PDFKit.PDFDocument,
  input: FnfPdfInput,
) {
  drawHeader(doc, input.client, 'Experience Certificate');

  doc
    .font('Helvetica')
    .fontSize(10)
    .text('Date: ' + fmtDate(input.issueDate), { align: 'right' });
  doc.moveDown(1.2);
  resetX(doc);

  doc.font('Helvetica-Bold').text('TO WHOM IT MAY CONCERN', { align: 'center' });
  doc.moveDown(1);
  resetX(doc);

  const doj = fmtDate(input.employee.dateOfJoining);
  const lwd = fmtDate(input.separation.lastWorkingDay || input.separation.separationDate);
  const body =
    'This is to certify that ' +
    (input.employee.fatherName ? 'Mr./Ms. ' : '') +
    input.employee.name +
    ' (Employee Code: ' +
    input.employee.employeeCode +
    ') was employed with ' +
    input.client.name +
    ' as ' +
    (input.employee.designation || 'an employee') +
    (input.employee.department ? ' in the ' + input.employee.department + ' department' : '') +
    ' from ' +
    doj +
    ' to ' +
    lwd +
    '.\n\n' +
    'During the tenure of employment with us, we found him/her to be sincere, hardworking and dedicated towards the assigned responsibilities. His/her conduct during the employment was satisfactory.\n\n' +
    'We wish him/her all the best for future endeavours.';
  doc.font('Helvetica').fontSize(11).text(body, { align: 'justify', lineGap: 3 });
  doc.moveDown(1);
  resetX(doc);

  drawFooter(doc, input.client);
}

function renderNoDuesCertificate(
  doc: PDFKit.PDFDocument,
  input: FnfPdfInput,
) {
  drawHeader(doc, input.client, 'No Dues Certificate');

  doc
    .font('Helvetica')
    .fontSize(10)
    .text('Date: ' + fmtDate(input.issueDate), { align: 'right' });
  doc.moveDown(1);
  resetX(doc);

  drawKeyValue(doc, [
    ['Employee Name', input.employee.name],
    ['Employee Code', input.employee.employeeCode],
    ['Designation', input.employee.designation || '-'],
    ['Date of Joining', fmtDate(input.employee.dateOfJoining)],
    ['Last Working Day', fmtDate(input.separation.lastWorkingDay || input.separation.separationDate)],
    ['Separation Reason', input.separation.reason || '-'],
  ]);

  doc.moveDown(0.6);
  resetX(doc);
  doc
    .font('Helvetica')
    .fontSize(11)
    .text(
      'This is to certify that the above named employee has cleared all dues with respect to ' +
        input.client.name +
        ' as on the last working day mentioned above. There are no pending dues, advances or obligations outstanding from either side post completion of full and final settlement amounting to ' +
        INR(input.settlement.netAmount) +
        '.',
      { align: 'justify', lineGap: 3 },
    );

  doc.moveDown(1);
  resetX(doc);
  drawFooter(doc, input.client);
}
