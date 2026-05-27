-- Phase 4c: contractor re-enrollment approval queue.
--
-- Mirror of face_reenrollment_requests (Phase 3e / migration
-- 20260516_face_reenrollment_requests.sql) but keyed by
-- contractor_employees.id. Same lifecycle:
--   PENDING -> APPROVED  (copy embedding/photo into contractor_face_enrollments
--                         and append RE_ENROLL row to
--                         contractor_face_enrollment_history)
--   PENDING -> REJECTED  (record reviewer + notes; live row untouched)
--
-- Held aside until a CLIENT/ADMIN/CRM/BRANCH_DESK reviewer approves so a
-- co-worker cannot silently retrain a contractor's face at a kiosk while
-- the real person is away.

CREATE TABLE IF NOT EXISTS contractor_face_reenrollment_requests (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id               uuid NOT NULL,
  contractor_employee_id  uuid NOT NULL
    REFERENCES contractor_employees(id) ON DELETE CASCADE,
  branch_id               uuid NULL,
  requested_by            uuid NULL,                      -- user_id of admin OR contractor user
  requested_at            timestamptz NOT NULL DEFAULT now(),
  reason                  text NULL,
  embedding               bytea NOT NULL,                 -- new candidate vector
  embedding_model         varchar(40) NULL,
  photo_url               text NULL,                      -- optional new selfie
  source                  varchar(20) NOT NULL DEFAULT 'ADMIN',  -- ADMIN | ESS | KIOSK
  status                  varchar(20) NOT NULL DEFAULT 'PENDING',
  reviewed_by             uuid NULL,
  reviewed_at             timestamptz NULL,
  review_notes            text NULL,
  CONSTRAINT chk_ctr_reenroll_status
    CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  CONSTRAINT chk_ctr_reenroll_source
    CHECK (source IN ('ADMIN','ESS','KIOSK'))
);

CREATE INDEX IF NOT EXISTS ix_ctr_reenroll_pending
  ON contractor_face_reenrollment_requests (client_id, requested_at DESC)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS ix_ctr_reenroll_contractor
  ON contractor_face_reenrollment_requests (contractor_employee_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS ix_ctr_reenroll_branch_pending
  ON contractor_face_reenrollment_requests (branch_id)
  WHERE status = 'PENDING';
