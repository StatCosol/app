-- reviewed_by was defined as UUID but the auto-approve path writes
-- 'system:kiosk-auto-approve' (not a valid UUID). Change to TEXT so both
-- system identifiers and user UUIDs can be stored.
ALTER TABLE kiosk_enroll_tickets
  ALTER COLUMN reviewed_by TYPE TEXT USING reviewed_by::text;
