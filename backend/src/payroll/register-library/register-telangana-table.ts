import * as ExcelJS from 'exceljs';
import type { RegisterLayout } from './register-layouts';
import type { RegisterInput, RegisterRow } from './register-workbook';

/** One branch register: one employee per row, all prescribed columns retained. */
export function addTelanganaRegisterTable(
  book: ExcelJS.Workbook,
  layout: RegisterLayout,
  rows: RegisterRow[],
  input: RegisterInput | undefined,
  context: Record<string, string>,
  period: string,
) {
  const sheet = book.addWorksheet('Form III');
  const width = layout.fields.length;
  sheet.columns = layout.fields.map((f) => ({
    width: f.key === 'serial' ? 6 : f.key === 'name' ? 24 : 16,
  }));
  const banner = (text: string) => {
    const n = sheet.rowCount + 1;
    // Keep establishment/signature text inside the first printed panel.
    sheet.mergeCells(n, 3, n, 14);
    const row = sheet.getRow(n);
    row.getCell(3).value = text;
    row.height = Math.max(26, Math.ceil(text.length / 130) * 14);
    row.alignment = { wrapText: true, vertical: 'middle' };
  };
  banner(
    'FORM III — INTEGRATED REGISTER | Muster roll-cum-register of wages / deductions / overtime / advances',
  );
  banner(
    'Establishment: ' +
      (context.establishment || input?.particulars?.establishmentName || '') +
      ' | Address: ' +
      (context.address || input?.particulars?.establishmentAddress || ''),
  );
  banner(
    'Period: ' +
      period +
      ' | Location: ' +
      (input?.particulars?.location || '') +
      ' | Business: ' +
      (input?.particulars?.business || ''),
  );
  banner(
    'Employer/manager: ' +
      (input?.particulars?.managerAddress || input?.employer || '') +
      ' | Retain with Form II',
  );
  const heading = sheet.addRow(
    layout.fields.map((f) => (f.key === 'serial' ? '1. Sl. No.' : f.label)),
  );
  heading.height = 115;
  heading.font = { bold: true, size: 10 };
  heading.alignment = { wrapText: true, vertical: 'middle' };
  const ordered = [...rows].sort(
    (a, b) => Number(a.serial || 0) - Number(b.serial || 0),
  );
  for (const record of ordered) {
    const row = sheet.addRow(
      layout.fields.map((f) => {
        const value = record[f.key] ?? '';
        return value !== '' && ['money', 'number'].includes(f.type)
          ? Number(value)
          : value;
      }),
    );
    row.height = Math.max(
      42,
      ...layout.fields.map(
        (f, i) =>
          Math.ceil(
            String(record[f.key] ?? '').length /
              (Number(sheet.getColumn(i + 1).width) - 2),
          ) * 13,
      ),
    );
    row.alignment = { wrapText: true, vertical: 'top' };
    row.font = { size: 10 };
    layout.fields.forEach(
      (f, i) =>
        (row.getCell(i + 1).numFmt =
          f.key === 'serial'
            ? '0'
            : f.type === 'money'
              ? '0.00'
              : f.type === 'number'
                ? '0.##'
                : '@'),
    );
  }
  banner(
    'Employer/contractor signatory: ' +
      (input?.particulars?.employerSignatory || '') +
      ' | Signature: ' +
      (input?.particulars?.employerSignature || ''),
  );
  banner(
    'Certificate for authentication by the principal employer (where employer is contractor): This is to certify that the contractor has paid wages to workmen employed by him as shown in this register in his / in the presence of his authorised representatives.',
  );
  banner(
    'Principal-employer representative: ' +
      (input?.particulars?.peSignatory || '') +
      ' | Designation: ' +
      (input?.particulars?.peDesignation || '') +
      ' | Signature: ' +
      (input?.particulars?.peSignature || ''),
  );
  sheet.eachRow((r) =>
    r.eachCell({ includeEmpty: true }, (c) => {
      c.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
    }),
  );
  sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 5 }];
  sheet.pageSetup = {
    paperSize: 8 as ExcelJS.PaperSize,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 2,
    fitToHeight: 0,
    printTitlesRow: '1:5',
    printTitlesColumn: 'A:B',
  };
  sheet.pageSetup.printArea =
    'A1:' + sheet.getColumn(width).letter + sheet.rowCount;
  sheet.headerFooter.oddHeader =
    '&LForm III | ' +
    String(context.establishment || input?.employer || '').replace(/&/g, '&&') +
    '&R' +
    period;
  sheet.headerFooter.oddFooter =
    'Form III — retain with Form II | Page &P of &N';
}
