import { BadRequestException } from '@nestjs/common';

export const MAX_INVOICE_NUMBER_LENGTH = 16;
export const MAX_INVOICE_PREFIX_CODE_LENGTH = 6;
export const INVOICE_SEQUENCE_WIDTH = 4;

export function normalizeInvoicePrefix(
  prefix: string | null | undefined,
  label = 'Invoice prefix',
): string {
  const normalized = (prefix || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  if (!normalized) {
    throw new BadRequestException(`${label} must contain letters or numbers`);
  }
  if (normalized.length > MAX_INVOICE_PREFIX_CODE_LENGTH) {
    throw new BadRequestException(
      `${label} can use at most ${MAX_INVOICE_PREFIX_CODE_LENGTH} letters/numbers so invoice numbers stay within ${MAX_INVOICE_NUMBER_LENGTH} characters`,
    );
  }
  return normalized;
}

export function compactFinancialYear(financialYear: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(financialYear);
  if (match) return `${match[1].slice(-2)}${match[2]}`;

  const digits = financialYear.replace(/\D/g, '');
  return digits.slice(-4).padStart(4, '0');
}

export function buildInvoiceNumber(
  normalizedPrefix: string,
  financialYear: string,
  sequence: number,
): string {
  if (sequence < 1 || sequence > 9999) {
    throw new BadRequestException(
      'Invoice sequence exceeded 9999 for this prefix and financial year',
    );
  }

  const invoiceNumber = `${normalizedPrefix}/${compactFinancialYear(
    financialYear,
  )}/${String(sequence).padStart(INVOICE_SEQUENCE_WIDTH, '0')}`;

  if (invoiceNumber.length > MAX_INVOICE_NUMBER_LENGTH) {
    throw new BadRequestException(
      `Invoice number must be ${MAX_INVOICE_NUMBER_LENGTH} characters or fewer`,
    );
  }

  return invoiceNumber;
}
