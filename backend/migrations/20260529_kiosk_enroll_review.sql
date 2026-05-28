ALTER TABLE kiosk_enroll_tickets
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS pending_embedding BYTEA,
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

ALTER TABLE kiosk_enroll_tickets
  DROP CONSTRAINT IF EXISTS kiosk_enroll_tickets_status_check;

ALTER TABLE kiosk_enroll_tickets
  ADD CONSTRAINT kiosk_enroll_tickets_status_check
  CHECK (status IN ('PENDING', 'REVIEW_PENDING', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED'));

CREATE INDEX IF NOT EXISTS idx_kiosk_enroll_tickets_review
  ON kiosk_enroll_tickets (client_id, status, captured_at DESC)
  WHERE status = 'REVIEW_PENDING';
