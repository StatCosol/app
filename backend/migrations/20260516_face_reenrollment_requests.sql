-- Phase 3e: re-enrollment approval queue.
--
-- When an employee or admin wants to overwrite an existing active face
-- enrollment, the request lands here as PENDING and the embedding is held
-- aside until a CLIENT/ADMIN/CRM reviewer approves it. This stops a
-- co-worker from quietly retraining a face on someone else's account at
-- a kiosk while the real person is on leave.
--
-- Approval flips status to APPROVED and copies (embedding, embedding_model,
-- photo_url) into face_enrollments + appends a RE_ENROLL row to
-- face_enrollment_history. Rejection just records the reason; nothing
-- changes on the live enrollment.

CREATE TABLE IF NOT EXISTS face_reenrollment_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid NOT NULL,
  employee_id       uuid NOT NULL,
  branch_id         uuid NULL,
  requested_by      uuid NULL,                      -- user_id of admin OR employee
  requested_at      timestamptz NOT NULL DEFAULT now(),
  reason            text NULL,                      -- why a re-enroll is needed
  embedding         bytea NOT NULL,                 -- new candidate vector
  embedding_model   varchar(40) NULL,
  photo_url         text NULL,                      -- optional new selfie
  source            varchar(20) NOT NULL DEFAULT 'ADMIN',  -- ADMIN | ESS | KIOSK
  status            varchar(20) NOT NULL DEFAULT 'PENDING',
  reviewed_by       uuid NULL,
  reviewed_at       timestamptz NULL,
  review_notes      text NULL,
  CONSTRAINT chk_reenroll_status
    CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  CONSTRAINT chk_reenroll_source
    CHECK (source IN ('ADMIN','ESS','KIOSK'))
);

CREATE INDEX IF NOT EXISTS ix_reenroll_pending
  ON face_reenrollment_requests (client_id, requested_at DESC)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS ix_reenroll_employee
  ON face_reenrollment_requests (employee_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS ix_reenroll_branch_pending
  ON face_reenrollment_requests (branch_id)
  WHERE status = 'PENDING';
