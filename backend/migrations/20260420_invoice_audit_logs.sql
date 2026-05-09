-- Add invoice_audit_logs table
CREATE TABLE IF NOT EXISTS invoice_audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  action        VARCHAR(50) NOT NULL,
  old_status    VARCHAR(30),
  new_status    VARCHAR(30),
  changed_by    UUID,
  payload       JSONB,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_audit_logs_invoice ON invoice_audit_logs(invoice_id);

-- Add total_gst column to invoices if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='total_gst') THEN
    ALTER TABLE invoices ADD COLUMN total_gst NUMERIC(14,2) DEFAULT 0;
  END IF;
END $$;
