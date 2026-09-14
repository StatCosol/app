import * as ExcelJS from 'exceljs';
import {
  calculateRateCard,
  ContractorRateCard,
  validateRateCard,
} from './contractor-rate-card';
import { applyMonthDivisor } from './contractor-working-days';
import { ContractorComputationService } from './contractor-computation.service';

const card = (divisor?: number | null): ContractorRateCard => ({
  ...(divisor !== undefined ? { divisor } : {}),
  rounding: 'RUPEE',
  components: [
    {
      code: 'BASIC_DA',
      label: 'Basic + DA',
      category: 'EARNING',
      method: 'FIXED',
      value: 16900,
      prorate: true,
    },
    {
      code: 'PT',
      label: 'Professional tax',
      category: 'DEDUCTION',
      method: 'FIXED',
      value: 150,
      prorate: false,
    },
  ],
});

describe('rate card without a fixed divisor', () => {
  it('accepts a card with no divisor', () => {
    expect(() => validateRateCard(card())).not.toThrow();
    expect(() => validateRateCard(card(null))).not.toThrow();
  });

  it('still accepts an older card that stores a divisor of 1–31', () => {
    expect(() => validateRateCard(card(30))).not.toThrow();
    expect(() => validateRateCard(card(0))).toThrow('divisor, if given');
    expect(() => validateRateCard(card(32))).toThrow('divisor, if given');
  });

  it('refuses to prorate without the month working days', () => {
    expect(() => calculateRateCard(card(), 13)).toThrow(
      "Prorated components need the wage month's working days",
    );
  });

  it('prorates by the wage month working days once applied', () => {
    // October 2026: 27 working days; 27 payable days pays the full month.
    expect(
      calculateRateCard(applyMonthDivisor(card(), '2026-10'), 27).amounts
        .BASIC_DA,
    ).toBe(16900);
  });
});

describe('quotation sheet with an empty divisor column', () => {
  async function normalize(rows: Array<Array<string | number>>) {
    const sheet = new ExcelJS.Workbook().addWorksheet('Components');
    sheet.addRow([
      'skill_category',
      'designation',
      'effective_from',
      'effective_to',
      'divisor',
      'rounding',
      'component_code',
      'label',
      'category',
      'method',
      'value',
      'basis',
      'ceiling',
      'prorate',
    ]);
    for (const r of rows) sheet.addRow(r);
    // normalizeQuotationSheet only uses the sheet helpers, no injected services.
    const svc = Object.create(ContractorComputationService.prototype);
    const out: ExcelJS.Worksheet = svc.normalizeQuotationSheet(
      sheet,
      '2026-10-01',
    );
    const json = out.getRow(2).getCell(5).value as string;
    return JSON.parse(json) as ContractorRateCard;
  }

  it('builds a card without a divisor from the template layout', async () => {
    const result = await normalize([
      [
        'SKILLED',
        'SECURITY GUARD',
        '',
        '',
        '',
        'RUPEE',
        'BASIC_DA',
        'Basic + DA',
        'EARNING',
        'FIXED',
        16000,
        '',
        '',
        'yes',
      ],
      [
        'SKILLED',
        'SECURITY GUARD',
        '',
        '',
        '',
        'RUPEE',
        'PT',
        'Professional tax',
        'DEDUCTION',
        'FIXED',
        150,
        '',
        '',
        'no',
      ],
    ]);
    expect(result.divisor).toBeUndefined();
    expect(result.components.map((c) => c.code)).toEqual(['BASIC_DA', 'PT']);
    expect(() => validateRateCard(result)).not.toThrow();
  });

  it('still reads an older sheet that fills the divisor column', async () => {
    const result = await normalize([
      [
        'SKILLED',
        'ASO',
        '',
        '',
        30,
        'RUPEE',
        'BASIC_DA',
        'Basic + DA',
        'EARNING',
        'FIXED',
        20000,
        '',
        '',
        'yes',
      ],
    ]);
    expect(result.divisor).toBe(30);
  });
});
