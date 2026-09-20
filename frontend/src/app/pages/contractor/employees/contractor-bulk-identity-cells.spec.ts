import { vi } from 'vitest';
import * as XLSX from 'xlsx';
import { ContractorEmployeesPageComponent } from './contractor-employees-page.component';

/**
 * Bank account numbers out of Excel. Excel makes a number of anything that
 * looks like one, dropping leading zeros and rewriting the tail past 15
 * digits. Every numeric cell used to be rejected outright, so an ordinary
 * account number typed into a spreadsheet could not be uploaded at all.
 */
describe('Contractor bulk upload — identity cells from Excel', () => {
  let component: ContractorEmployeesPageComponent;

  beforeEach(() => {
    type Args = ConstructorParameters<typeof ContractorEmployeesPageComponent>;
    component = new ContractorEmployeesPageComponent(
      {} as Args[0],
      {} as Args[1],
      { success: vi.fn(), error: vi.fn() } as unknown as Args[2],
      {} as Args[3],
      { markForCheck: vi.fn() } as unknown as Args[4],
    );
    component.availableBranches = [{ id: 'branch-1', branchName: 'Branch 1' }] as any;
    component.bulkBranchId = 'branch-1';
  });

  const row = (over: Record<string, any> = {}) => ({
    name: 'Ravi Kumar',
    skillCategory: 'SKILLED',
    monthlySalary: 15000,
    aadhaar: '100000000001',
    pan: 'ABCDE1234F',
    bankAccount: '001234567890',
    ...over,
  });
  const check = (over: Record<string, any> = {}) =>
    component['validateBulkRows']([row(over)])[0];

  it('keeps a text account number exactly, leading zeros and all', () => {
    const r = check({ bankAccount: '001234567890' });
    expect(r.dto.bankAccount).toBe('001234567890');
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('accepts an account number Excel turned into a number, and says a zero may be missing', () => {
    const r = check({ bankAccount: 12345678901 });

    expect(r.errors).toEqual([]); // used to be rejected outright
    expect(r.dto.bankAccount).toBe('12345678901');
    expect(r.warnings.join(' ')).toContain('starts with a zero');
  });

  it('rejects an account number long enough for Excel to have corrupted it', () => {
    // 16 digits: Excel keeps 15 significant digits, so the tail is already lost.
    const r = check({ bankAccount: 1234567890123456 });

    expect(r.errors.join(' ')).toContain('lost digits');
    expect(r.errors.join(' ')).toContain('Format the column as Text');
  });

  it('rejects a bank account that arrived as a fraction', () => {
    expect(check({ bankAccount: 1234.5 }).errors.join(' ')).toContain('lost digits');
  });

  it('accepts a cell Excel displayed in scientific notation but stored exactly', () => {
    // 1.2345678e10 is the integer 12345678000 — no digits were lost.
    const r = check({ bankAccount: 1.2345678e10 });
    expect(r.errors).toEqual([]);
    expect(r.dto.bankAccount).toBe('12345678000');
  });

  it('does not warn about a numeric aadhaar, which cannot start with a zero', () => {
    const r = check({ aadhaar: 100000000001 });
    expect(r.dto.aadhaar).toBe('100000000001');
    expect(r.warnings).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it('counts rows carrying a warning separately from rows with errors', () => {
    component.bulkPreview = component['validateBulkRows']([
      row({ bankAccount: 12345678901 }), // warning only
      row({ bankAccount: '' }), // error
      row(), // clean
    ]);

    expect(component.bulkWarningCount).toBe(1);
    expect(component.bulkErrorCount).toBe(1);
    expect(component.bulkValidCount).toBe(2); // the warning row still uploads
  });

  it('formats the identity columns of the template as text', () => {
    const headers = ['name', 'bankAccount', 'aadhaar', 'pan'];
    const ws = XLSX.utils.json_to_sheet([{ name: 'Ravi Kumar', bankAccount: '', aadhaar: '', pan: '' }], {
      header: headers,
    });

    component['formatIdentityColumnsAsText'](ws, headers, 5);

    // Column B is bankAccount; every row a user types into must be Text ("@").
    for (const addr of ['B2', 'B3', 'B6', 'C2', 'D2']) {
      expect(ws[addr]?.z, `${addr} number format`).toBe('@');
      expect(ws[addr]?.t, `${addr} cell type`).toBe('s');
    }
    expect(ws['A2']?.z).toBeUndefined(); // name is left alone
  });

  it('survives a round trip through a written workbook', () => {
    const headers = ['name', 'bankAccount'];
    const ws = XLSX.utils.json_to_sheet([{ name: 'Ravi Kumar', bankAccount: '' }], { header: headers });
    component['formatIdentityColumnsAsText'](ws, headers, 3);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');

    // cellStyles is what surfaces the number format on read; the format is in
    // the file either way, which is what Excel acts on.
    const reread = XLSX.read(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }), {
      type: 'array',
      cellStyles: true,
    });
    const sheet = reread.Sheets['Employees'];

    expect(sheet['B2']?.z).toBe('@');
    expect(sheet['B4']?.z).toBe('@');
  });
});
