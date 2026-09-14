import * as ExcelJS from 'exceljs';
import { ContractorComputationService } from './contractor-computation.service';

describe('quotation component template', () => {
  it('leaves the divisor column empty on every sample row', async () => {
    // quotationTemplate only builds a workbook; no injected services are used.
    const svc = Object.create(ContractorComputationService.prototype);
    const buffer: Buffer = await svc.quotationTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Components')!;

    const header = sheet.getRow(1).values as unknown[];
    const divisorCol = header.indexOf('divisor');
    expect(divisorCol).toBeGreaterThan(0);

    const dataRows = sheet.rowCount - 1;
    expect(dataRows).toBe(18); // 9 components × SECURITY GUARD and ASO
    for (let r = 2; r <= sheet.rowCount; r++) {
      const value = sheet.getRow(r).getCell(divisorCol).value;
      expect(value === null || value === '').toBe(true);
    }

    const notes = workbook.getWorksheet('Instructions')!;
    const text = (notes.getColumn(1).values as unknown[]).join(' ');
    expect(text).toContain('Leave divisor empty');
    expect(text).toContain('calendar days excluding Sundays');
  });
});
