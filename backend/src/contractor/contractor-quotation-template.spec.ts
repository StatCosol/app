import * as ExcelJS from 'exceljs';
import { ContractorComputationService } from './contractor-computation.service';
import { calculateRateCard, validateRateCard } from './contractor-rate-card';

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
    expect(text).toContain('method FORMULA');
  });

  it('turns its own formula rows into valid rate cards', async () => {
    const svc = Object.create(ContractorComputationService.prototype);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await svc.quotationTemplate()) as unknown as ArrayBuffer,
    );
    const sheet = workbook.getWorksheet('Components')!;
    // A formula typed with "=" is stored by Excel as a formula cell.
    const header = sheet.getRow(1).values as unknown[];
    sheet.getRow(5).getCell(header.indexOf('formula')).value = {
      formula: 'BASIC_DA*4.81%',
      result: 0,
    } as ExcelJS.CellFormulaValue;
    const normalized = svc.normalizeQuotationSheet(sheet, '2026-06-01');
    expect(normalized.rowCount).toBe(3);
    const cards = [2, 3].map((r) =>
      validateRateCard(
        JSON.parse(String(normalized.getRow(r).getCell(5).value)),
      ),
    );
    expect(cards[0].components.find((c) => c.code === 'BONUS')).toMatchObject({
      method: 'FORMULA',
      formula: 'BASIC_DA * 8.33%',
    });
    expect(cards[0].components.find((c) => c.code === 'LEAVE')!.formula).toBe(
      'BASIC_DA*4.81%',
    );
    const guard = calculateRateCard({ ...cards[0], divisor: 26 }, 26);
    expect(guard.amounts.BONUS).toBe(1333);
    expect(guard.amounts.LEAVE).toBe(770);
  });
});

describe('formulas filled down in Excel', () => {
  it('reads each filled-down cell as the formula typed in the first one', async () => {
    const svc = Object.create(ContractorComputationService.prototype);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Components');
    const header = [
      'skill_category',
      'designation',
      'rounding',
      'component_code',
      'label',
      'category',
      'method',
      'value',
      'prorate',
      'formula',
    ];
    sheet.addRow(header);
    sheet.addRow([
      'SKILLED',
      'GUARD',
      'RUPEE',
      'BASIC_DA',
      'Basic',
      'EARNING',
      'FIXED',
      16000,
      'yes',
      '',
    ]);
    sheet.addRow([
      'SKILLED',
      'GUARD',
      'RUPEE',
      'LWF2',
      'Welfare',
      'EARNING',
      'FIXED',
      10,
      'no',
      '',
    ]);
    sheet.addRow([
      'SKILLED',
      'GUARD',
      'RUPEE',
      'BONUS',
      'Bonus',
      'EARNING',
      'FORMULA',
      '',
      'no',
      '',
    ]);
    sheet.addRow([
      'SKILLED',
      'GUARD',
      'RUPEE',
      'LEAVE',
      'Leave',
      'EARNING',
      'FORMULA',
      '',
      'no',
      '',
    ]);
    // As Excel saves a formula filled from J4 down to J5.
    sheet.getCell('J4').value = {
      formula: '(BASIC_DA+LWF2)*10%',
      shareType: 'shared',
      ref: 'J4:J5',
      result: 0,
    } as any;
    sheet.getCell('J5').value = { sharedFormula: 'J4', result: 0 } as any;
    const normalized = svc.normalizeQuotationSheet(sheet, '2026-06-01');
    const card = validateRateCard(
      JSON.parse(String(normalized.getRow(2).getCell(5).value)),
    );
    const formulas = card.components
      .filter((c) => c.method === 'FORMULA')
      .map((c) => c.formula);
    expect(formulas).toEqual(['(BASIC_DA+LWF2)*10%', '(BASIC_DA+LWF2)*10%']);
    expect(calculateRateCard({ ...card, divisor: 26 }, 26).amounts.LEAVE).toBe(
      1601,
    );
  });
});
