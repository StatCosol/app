-- Pending Payment Follow-ups
-- Tracks already-issued invoices (typically pre-Statco or external) for
-- which payment is awaited from the client. Supports CSV bulk-upload
-- and reminder emails.
--
-- Run: auto-applied via scripts/apply-migrations.mjs at container start.

DO $$ BEGIN
  CREATE TYPE pending_payment_status AS ENUM ('PENDING','PAID','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS pending_payment_followups (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number           VARCHAR(100) NOT NULL,
  client_name              VARCHAR(250) NOT NULL,
  client_email             VARCHAR(250) NOT NULL,
  cc_email                 VARCHAR(250),
  amount                   NUMERIC(14,2) NOT NULL,
  invoice_date             DATE,
  due_date                 DATE,
  notes                    TEXT,
  status                   pending_payment_status NOT NULL DEFAULT 'PENDING',
  reminder_count           INTEGER NOT NULL DEFAULT 0,
  last_reminder_sent_at    TIMESTAMPTZ,
  last_reminder_status     VARCHAR(20),
  last_failure_reason      TEXT,
  uploaded_by              UUID,
  uploaded_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_payment_followups_status
  ON pending_payment_followups(status);
CREATE INDEX IF NOT EXISTS idx_pending_payment_followups_due_date
  ON pending_payment_followups(due_date);
CREATE INDEX IF NOT EXISTS idx_pending_payment_followups_invoice_number
  ON pending_payment_followups(invoice_number);
