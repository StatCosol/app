-- Preserve the link and printed references when a Proforma Invoice is
-- converted into a separately numbered Tax Invoice.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS proforma_reference_number VARCHAR(16),
  ADD COLUMN IF NOT EXISTS purchase_order_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS converted_from_proforma_id UUID;

DO $$
BEGIN
  ALTER TABLE invoices
    ADD CONSTRAINT fk_invoices_converted_from_proforma
    FOREIGN KEY (converted_from_proforma_id)
    REFERENCES invoices(id)
    ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_converted_from_proforma
  ON invoices(converted_from_proforma_id)
  WHERE converted_from_proforma_id IS NOT NULL;

