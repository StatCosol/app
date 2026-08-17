import {
  normalizeInvoicePrefix,
  compactFinancialYear,
  buildInvoiceNumber,
} from './invoice-number.util';
import { BadRequestException } from '@nestjs/common';

describe('invoice-number util', () => {
  describe('normalizeInvoicePrefix', () => {
    it('strips non-alphanumerics and upper-cases', () => {
      expect(normalizeInvoicePrefix('inv-01')).toBe('INV01');
    });

    it('throws when nothing usable remains', () => {
      expect(() => normalizeInvoicePrefix('!!!')).toThrow(BadRequestException);
      expect(() => normalizeInvoicePrefix('')).toThrow(BadRequestException);
    });

    it('throws when longer than the 6-char code limit', () => {
      expect(() => normalizeInvoicePrefix('ABCDEFG')).toThrow(/at most 6/);
    });
  });

  describe('compactFinancialYear', () => {
    it('compacts a YYYY-YY financial year', () => {
      expect(compactFinancialYear('2026-27')).toBe('2627');
    });

    it('falls back to the last four digits otherwise', () => {
      expect(compactFinancialYear('FY2026-27')).toBe('2627');
      expect(compactFinancialYear('2026')).toBe('2026');
    });
  });

  describe('buildInvoiceNumber', () => {
    it('formats prefix / compact-FY / zero-padded sequence', () => {
      expect(buildInvoiceNumber('INV', '2026-27', 1)).toBe('INV/2627/0001');
      expect(buildInvoiceNumber('INV', '2026-27', 9999)).toBe('INV/2627/9999');
    });

    it('rejects a sequence outside 1..9999', () => {
      expect(() => buildInvoiceNumber('INV', '2026-27', 0)).toThrow(
        BadRequestException,
      );
      expect(() => buildInvoiceNumber('INV', '2026-27', 10000)).toThrow(
        BadRequestException,
      );
    });

    it('rejects an invoice number longer than the 16-char cap', () => {
      // 7-char prefix → "ABCDEFG/2627/0001" = 17 chars
      expect(() => buildInvoiceNumber('ABCDEFG', '2026-27', 1)).toThrow(
        /16 characters or fewer/,
      );
    });
  });
});
