-- Face kiosk 1:N accuracy upgrade:
--  * multi-template gallery (face_enrollment_templates)
--  * two-level punch decision + review workflow columns
--  * per-client face threshold overrides
-- All idempotent; safe to re-run.

-- ── Multi-template gallery ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS face_enrollment_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  branch_id UUID,
  subject_type VARCHAR(12) NOT NULL CHECK (subject_type IN ('EMPLOYEE','CONTRACTOR')),
  subject_id UUID NOT NULL,
  embedding BYTEA NOT NULL,
  embedding_model VARCHAR(40),
  source VARCHAR(20) NOT NULL DEFAULT 'ENROLL',
  quality_score NUMERIC,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fet_client ON face_enrollment_templates(client_id);
CREATE INDEX IF NOT EXISTS idx_fet_subject ON face_enrollment_templates(subject_type, subject_id);

-- ── Two-level decision / review workflow ───────────────────────────────
ALTER TABLE mobile_attendance_punches
  ADD COLUMN IF NOT EXISTS decision VARCHAR(20) NOT NULL DEFAULT 'AUTO',
  ADD COLUMN IF NOT EXISTS reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_note TEXT;

ALTER TABLE contractor_biometric_punches
  ADD COLUMN IF NOT EXISTS decision VARCHAR(20) NOT NULL DEFAULT 'AUTO',
  ADD COLUMN IF NOT EXISTS reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_note TEXT;

CREATE INDEX IF NOT EXISTS idx_map_decision
  ON mobile_attendance_punches(client_id, decision)
  WHERE decision = 'REVIEW_PENDING';
CREATE INDEX IF NOT EXISTS idx_cbp_decision
  ON contractor_biometric_punches(client_id, decision)
  WHERE decision = 'REVIEW_PENDING';

-- ── Per-client face matching threshold overrides (NULL = env default) ──
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS face_auto_accept_score NUMERIC,
  ADD COLUMN IF NOT EXISTS face_review_min_score NUMERIC,
  ADD COLUMN IF NOT EXISTS face_min_match_margin NUMERIC,
  ADD COLUMN IF NOT EXISTS face_min_liveness_score NUMERIC;
