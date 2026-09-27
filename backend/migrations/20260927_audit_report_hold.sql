-- Additive report governance metadata; existing reports are not held.
ALTER TABLE audit_reports ADD COLUMN IF NOT EXISTS held_at timestamptz;
ALTER TABLE audit_reports ADD COLUMN IF NOT EXISTS held_by_user_id uuid;
ALTER TABLE audit_reports ADD COLUMN IF NOT EXISTS hold_remarks text;
