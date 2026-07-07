-- Enforce the finance invoice-number maximum used by GST/e-invoice flows.
-- Existing deployments may already contain older long numbers such as
-- STS/INV/2026-27/0001, so add the check as NOT VALID first. PostgreSQL still
-- enforces NOT VALID check constraints for new and updated rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'chk_invoices_invoice_number_max_16'
       AND conrelid = 'invoices'::regclass
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT chk_invoices_invoice_number_max_16
      CHECK (char_length(invoice_number) <= 16) NOT VALID;
  END IF;
END $$;

-- Narrow the physical column on clean databases. If historical rows are longer
-- than 16 characters, the check above protects all future writes and the column
-- can be narrowed after old invoice numbers are archived or renumbered.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM invoices WHERE char_length(invoice_number) > 16
  ) THEN
    ALTER TABLE invoices
      ALTER COLUMN invoice_number TYPE varchar(16);

    ALTER TABLE invoices
      VALIDATE CONSTRAINT chk_invoices_invoice_number_max_16;
  END IF;
END $$;
