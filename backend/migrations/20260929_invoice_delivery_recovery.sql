CREATE TABLE IF NOT EXISTS invoice_deliveries (
  id uuid PRIMARY KEY REFERENCES invoice_email_logs(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  fingerprint varchar(64) NOT NULL,
  pdf_path text,
  status varchar(20) NOT NULL CHECK (status IN ('PREPARING','SENDING','UNKNOWN','ACCEPTED','RECONCILED','NOT_SENT')),
  message_id text,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid,
  resolution_note text,
  UNIQUE (invoice_id, request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_delivery_unresolved
  ON invoice_deliveries(invoice_id) WHERE status IN ('PREPARING','SENDING','UNKNOWN','ACCEPTED');
CREATE INDEX IF NOT EXISTS idx_invoice_delivery_recovery
  ON invoice_deliveries(status, updated_at);
