export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  GENERATED = 'GENERATED',
  EMAILED = 'EMAILED',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

export const ISSUED_INVOICE_STATUSES = [
  InvoiceStatus.APPROVED,
  InvoiceStatus.GENERATED,
  InvoiceStatus.EMAILED,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.PAID,
  InvoiceStatus.OVERDUE,
];
