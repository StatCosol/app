-- Contractor face-attendance bridge (Phase 4a).
--
-- The existing face_enrollments table is keyed by employees.id (the
-- in-house workforce). Contractor employees live in their own table
-- (contractor_employees) and have no representation there. This
-- migration introduces a parallel pair of tables so a contractor
-- employee can have a face enrollment lifecycle independent of any
-- regular employee, without disturbing existing employee schema or
-- queries.
--
-- Scope of this migration:
--   1. contractor_face_enrollments         — 1 row per contractor employee
--   2. contractor_face_enrollment_history  — append-only audit log
--
-- Out of scope (deferred):
--   - Punch path (biometric_punches.contractor_employee_id) — added when
--     contractor ESS/KIOSK punching is wired.
--   - Cross-table duplicate-face guard between employees and contractors.
--   - Re-enrollment approval workflow for contractors.

CREATE TABLE IF NOT EXISTS contractor_face_enrollments (
  contractor_employee_id uuid PRIMARY KEY
    REFERENCES contractor_employees(id) ON DELETE CASCADE,
  client_id              uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  branch_id              uuid NULL REFERENCES client_branches(id) ON DELETE SET NULL,
  contractor_user_id     uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  embedding              bytea NULL,
  embedding_model        varchar(40) NULL,
  photo_url              text NULL,
  consent_given_at       timestamptz NULL,
  consent_given_by       uuid NULL,
  enrolled_at            timestamptz NOT NULL DEFAULT now(),
  enrolled_by            uuid NULL,
  is_active              boolean NOT NULL DEFAULT true,
  deactivated_at         timestamptz NULL,
  deactivation_reason    text NULL,
  appearance_drift_flagged_at timestamptz NULL,
  appearance_drift_avg_score numeric NULL,
  appearance_drift_sample_count integer NULL,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_contractor_face_enroll_client
  ON contractor_face_enrollments (client_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS ix_contractor_face_enroll_branch
  ON contractor_face_enrollments (branch_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS ix_contractor_face_enroll_contractor
  ON contractor_face_enrollments (contractor_user_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS ix_contractor_face_enrollments_drift_flagged
  ON contractor_face_enrollments (client_id, appearance_drift_flagged_at)
  WHERE appearance_drift_flagged_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS contractor_face_enrollment_history (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_employee_id uuid NOT NULL
    REFERENCES contractor_employees(id) ON DELETE CASCADE,
  client_id              uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  action                 text NOT NULL,   -- ENROLL | RE_ENROLL | DEACTIVATE | REACTIVATE
  reason                 text NULL,
  embedding_model        text NULL,
  actor_user_id          uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contractor_face_hist_emp_time
  ON contractor_face_enrollment_history (contractor_employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contractor_face_hist_client_time
  ON contractor_face_enrollment_history (client_id, created_at DESC);
