-- Preserve historical invoice numbers while keeping newly generated numbers
-- capped at 16 characters in invoice-number.util.ts. The earlier NOT VALID
-- 16-character check blocks every unrelated UPDATE to a historical long row.
ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS chk_invoices_invoice_number_max_16;

ALTER TABLE invoices
  ALTER COLUMN invoice_number TYPE varchar(64);

ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS chk_invoices_invoice_number_max_64;

ALTER TABLE invoices
  ADD CONSTRAINT chk_invoices_invoice_number_max_64
  CHECK (char_length(invoice_number) <= 64) NOT VALID;
