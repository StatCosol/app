-- =====================================================================
-- Phase 3 — Preliminary Publish + Vendor 6-Day Window + Recurring NC
-- =====================================================================
-- Adds:
--   * audits.preliminary_published_at / _by / _deadline_days
--   * audit_non_compliances.published_at, vendor_window_until,
--                            is_recurring, original_nc_id, recurrence_count
-- =====================================================================

ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS preliminary_published_at         timestamptz NULL,
  ADD COLUMN IF NOT EXISTS preliminary_published_by_user_id uuid        NULL,
  ADD COLUMN IF NOT EXISTS preliminary_findings_count       int         NULL,
  ADD COLUMN IF NOT EXISTS vendor_window_days               int         NOT NULL DEFAULT 6;

ALTER TABLE audit_non_compliances
  ADD COLUMN IF NOT EXISTS published_at         timestamptz NULL,
  ADD COLUMN IF NOT EXISTS vendor_window_until  date        NULL,
  ADD COLUMN IF NOT EXISTS is_recurring         boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_nc_id       uuid        NULL,
  ADD COLUMN IF NOT EXISTS recurrence_count     int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS finding_signature    varchar(64) NULL;

CREATE INDEX IF NOT EXISTS idx_anc_audit_published
  ON audit_non_compliances (audit_id, published_at);

CREATE INDEX IF NOT EXISTS idx_anc_window_until
  ON audit_non_compliances (vendor_window_until)
  WHERE status IN ('NC_RAISED', 'AWAITING_REUPLOAD');

CREATE INDEX IF NOT EXISTS idx_anc_signature
  ON audit_non_compliances (finding_signature)
  WHERE finding_signature IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_anc_recurring
  ON audit_non_compliances (is_recurring) WHERE is_recurring = true;

COMMENT ON COLUMN audits.preliminary_published_at IS
  'Phase 3 — when the auditor published the preliminary findings to the vendor/contractor.';
COMMENT ON COLUMN audit_non_compliances.vendor_window_until IS
  'Phase 3 — vendor closure deadline (date). Default = published_at + audits.vendor_window_days.';
COMMENT ON COLUMN audit_non_compliances.is_recurring IS
  'Phase 3 — true when this NC matches a previously-raised finding for the same client/branch.';
