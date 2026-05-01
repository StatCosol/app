-- Enforce unique invoice numbers across pending payment follow-ups.
-- Existing duplicates (if any) are kept; the index creation will fail if
-- duplicates exist — clean those manually first.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_payment_followups_invoice
  ON pending_payment_followups (invoice_number);
