-- Allow invoice_email_logs to be tied to either an invoice OR a pending-payment follow-up.
ALTER TABLE invoice_email_logs ALTER COLUMN invoice_id DROP NOT NULL;
ALTER TABLE invoice_email_logs
  ADD COLUMN IF NOT EXISTS pending_payment_id UUID NULL
    REFERENCES pending_payment_followups(id) ON DELETE SET NULL;
ALTER TABLE invoice_email_logs
  ADD COLUMN IF NOT EXISTS source VARCHAR(30) NOT NULL DEFAULT 'INVOICE';

CREATE INDEX IF NOT EXISTS idx_invoice_email_logs_pending
  ON invoice_email_logs (pending_payment_id);
CREATE INDEX IF NOT EXISTS idx_invoice_email_logs_source
  ON invoice_email_logs (source);
