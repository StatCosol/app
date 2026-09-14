import * as ExcelJS from 'exceljs';
import type { RegisterLayout } from './register-layouts';
import type { RegisterInput, RegisterRow } from './register-workbook';

/** Shared register tables retain all source columns, without splitting workers into tabs. */
export function addSharedRegisterTable(
  book: ExcelJS.Workbook,
  layout: RegisterLayout,
  rows: RegisterRow[],
  input: RegisterInput | undefined,
  context: Record<string, string>,
  period: string,
  form: { formNumber: string; title: string; ruleReference: string },
) {
  const sheet = book.addWorksheet('Form ' + form.formNumber);
  sheet.columns = layout.fields.map((f) => ({
    width:
      f.key === 'serial'
        ? 8
        : ['name', 'injuredName', 'employeeCode'].includes(f.key)
          ? 24
          : /^day\d+Status$/.test(f.key)
            ? 8
            : 17,
  }));
  // Keep banners outside the repeating identity columns on printed panels.
  const banner = (text: string) => {
    const n = sheet.rowCount + 1;
    sheet.mergeCells(n, 3, n, Math.min(12, layout.fields.length));
    sheet.getCell(n, 3).value = text;
    sheet.getRow(n).height = Math.max(28, Math.ceil(text.length / 110) * 15);
    sheet.getRow(n).alignment = { wrapText: true, vertical: 'middle' };
  };
  banner(
    'FORM ' + form.formNumber + ' — ' + form.title + ' | ' + form.ruleReference,
  );
  banner(
    'Establishment: ' +
      (context.establishment || '') +
      ' | Address: ' +
      (context.address || ''),
  );
  banner(
    'Employer: ' +
      (input?.employer || '') +
      ' | Owner: ' +
      (input?.owner || '') +
      ' | Registration: ' +
      (input?.registrationNumber || ''),
  );
  banner(
    'Period: ' +
      period +
      ' | Issue date: ' +
      (input?.issueDate || '') +
      ' | Supporting record: ' +
      (input?.supportingReference || ''),
  );
  const heading = sheet.addRow(layout.fields.map((f) => f.label));
  heading.height = 115;
  heading.font = { bold: true, size: 10 };
  heading.alignment = { wrapText: true, vertical: 'middle' };
  const ordered = layout.fields.some((f) => f.key === 'serial')
    ? [...rows].sort((a, b) => Number(a.serial || 0) - Number(b.serial || 0))
    : rows;
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
          f.type === 'money'
            ? '0.00'
            : f.type === 'number'
              ? Number.isInteger(Number(record[f.key]))
                ? '0'
                : '0.00'
              : '@'),
    );
  }
  sheet.eachRow((row) =>
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
    }),
  );
  const identityColumns = Math.min(
    3,
    Math.max(
      2,
      layout.fields.findIndex((f) => ['name', 'injuredName'].includes(f.key)) +
        1,
    ),
  );
  sheet.views = [{ state: 'frozen', xSplit: identityColumns, ySplit: 5 }];
  sheet.pageSetup = {
    paperSize: 8 as ExcelJS.PaperSize,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: Math.ceil(layout.fields.length / 13),
    fitToHeight: 0,
    printTitlesRow: '1:5',
    printTitlesColumn: 'A:B',
  };
  // Do not repeat a part of a merged heading on horizontal continuation pages.
  // Only the first two identity columns are repeated; the full branch is in the page header.
  sheet.pageSetup.printTitlesColumn = 'A:B';
  sheet.pageSetup.printArea =
    'A1:' + sheet.getColumn(layout.fields.length).letter + sheet.rowCount;
  sheet.headerFooter.oddHeader =
    '&LForm ' +
    form.formNumber +
    ' | ' +
    String(context.establishment || input?.employer || '').replace(/&/g, '&&') +
    '&R' +
    period;
  sheet.headerFooter.oddFooter = form.ruleReference + ' | Page &P of &N';
}
