import * as ExcelJS from 'exceljs';
import { REGISTER_FORMS } from './register-catalogue';
import { registerLayout } from './register-layouts';
import { registerWorkbook, RegisterInput } from './register-workbook';

const forms = REGISTER_FORMS.filter((f) =>
  registerLayout(f.sourceId, f.formNumber, f.actCode),
);
describe('All implemented register record grouping', () => {
  it.each(forms.map((f) => [f.id, f] as const))(
    '%s preserves three records and prescribed columns',
    async (_id, form) => {
      const layout = registerLayout(
        form.sourceId,
        form.formNumber,
        form.actCode,
      )!;
      const rows = [3, 1, 2].map((serial) =>
        Object.fromEntries(
          layout.fields.map((f) => [
            f.key,
            f.key === 'serial'
              ? serial
              : ['money', 'number'].includes(f.type)
                ? serial * 100
                : f.type === 'date'
                  ? '2026-09-01'
                  : 'Record ' + serial + ' ' + f.key,
          ]),
        ),
      );
      const input = { rows, year: 2026, month: 9 } as RegisterInput;
      const book = new ExcelJS.Workbook();
      await book.xlsx.load((await registerWorkbook(form.id, input)) as any);
      const sheets = book.worksheets.filter(
        (s) =>
          s.name !== 'Identity and review' &&
          !(layout.particulars && s.name === 'Form II'),
      );
      if (layout.employeeRows === 'TABLE') {
        expect(sheets).toHaveLength(1);
        const sheet = sheets[0];
        expect(sheet.getRow(5).cellCount).toBe(layout.fields.length);
        const expected = layout.fields.some((f) => f.key === 'serial')
          ? [rows[1], rows[2], rows[0]]
          : rows;
        expected.forEach((row, i) =>
          layout.fields.forEach((field, col) => {
            expect(sheet.getCell(i + 6, col + 1).value).toBe(row[field.key]);
          }),
        );
      } else {
        expect(sheets).toHaveLength(3);
        sheets.forEach((sheet, i) => {
          const text = JSON.stringify(sheet.getSheetValues());
          // Each employee's own source details must remain on their own sheet.
          const identity = layout.fields.find((f) =>
            ['name', 'employee_2', 'injuredName'].includes(f.key),
          );
          if (identity) expect(text).toContain(String(rows[i][identity.key]));
        });
      }
      expect(
        rows.map((row) => row.serial).filter((v) => v !== undefined),
      ).toEqual(layout.fields.some((f) => f.key === 'serial') ? [3, 1, 2] : []);
    },
  );
  it('retains explicit individual leave pages and employee cards', () => {
    expect(registerLayout('osh', 'XX')?.employeeRows).toBeUndefined();
    expect(registerLayout('mh', 'O')?.employeeRows).toBeUndefined();
    expect(registerLayout('apw', 'I')?.employeeRows).toBeUndefined();
    expect(registerLayout('apw', 'V')?.employeeRows).toBeUndefined();
    expect(registerLayout('apw', 'IX')?.employeeRows).toBeUndefined();
    expect(registerLayout('rjw', 'V')?.employeeRows).toBe('TABLE');
    expect(registerLayout('mh', 'Q')?.employeeRows).toBe('TABLE');
  });
});
