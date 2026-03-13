-- Migration: Add clause + recommendation to audit_observations, add score to audits
-- Date: 2026-02-10

BEGIN;

-- ─── Observation: clause (legal section reference) ─────────────────
ALTER TABLE audit_observations
  ADD COLUMN IF NOT EXISTS clause varchar(255);

-- ─── Observation: recommendation (corrective action guidance) ──────
ALTER TABLE audit_observations
  ADD COLUMN IF NOT EXISTS recommendation text;

-- ─── Audit: score (0-100, computed from observations) ──────────────
ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS score decimal(5,2);

ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS score_calculated_at timestamptz;

COMMIT;
