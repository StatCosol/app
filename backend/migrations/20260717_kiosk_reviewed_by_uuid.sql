-- Supersede 20260716_kiosk_reviewed_by_text.sql.
-- Auto-approval now records the ticket creator UUID, so reviewed_by must stay
-- UUID-compatible with entities and audit/enrollment user columns.

ALTER TABLE kiosk_enroll_tickets
  ADD COLUMN IF NOT EXISTS reviewed_by UUID;

ALTER TABLE kiosk_enroll_tickets
  ALTER COLUMN reviewed_by TYPE UUID
  USING CASE
    WHEN reviewed_by::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN reviewed_by::text::uuid
    WHEN created_by IS NOT NULL
      THEN created_by
    ELSE NULL
  END;
