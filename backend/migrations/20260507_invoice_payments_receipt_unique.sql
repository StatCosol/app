-- Enforce uniqueness on invoice_payments.receipt_number so concurrent
-- payment submissions cannot produce duplicate receipts. Pairs with the
-- transactional retry logic in InvoicePaymentsService.recordPayment().

CREATE UNIQUE INDEX IF NOT EXISTS ux_invoice_payments_receipt_number
  ON invoice_payments (receipt_number);
