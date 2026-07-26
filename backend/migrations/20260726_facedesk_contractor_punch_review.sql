-- FaceDesk contractor punch reliability and review compatibility.
--
-- 1. Persist the Android offline queue reference in the contractor pipeline,
--    with the same per-client idempotency guarantee as employee FaceDesk logs.
-- 2. Link a FaceDesk review item to a contractor punch so the existing
--    FaceDesk review screen can approve/reject contractor face mismatches.
-- 3. Allow FACE_MISMATCH in schemas created by the original FaceDesk migration.

ALTER TABLE public.contractor_biometric_punches
  ADD COLUMN IF NOT EXISTS offline_ref varchar(80);

CREATE UNIQUE INDEX IF NOT EXISTS uq_contractor_punch_offline_ref
  ON public.contractor_biometric_punches (client_id, offline_ref)
  WHERE offline_ref IS NOT NULL;

ALTER TABLE public.facedesk_attendance_review_queue
  ADD COLUMN IF NOT EXISTS contractor_punch_id uuid;

CREATE INDEX IF NOT EXISTS idx_fd_review_contractor_punch
  ON public.facedesk_attendance_review_queue (contractor_punch_id)
  WHERE contractor_punch_id IS NOT NULL;

ALTER TABLE public.facedesk_attendance_review_queue
  DROP CONSTRAINT IF EXISTS facedesk_attendance_review_queue_issue_type_check;

ALTER TABLE public.facedesk_attendance_review_queue
  DROP CONSTRAINT IF EXISTS chk_facedesk_review_issue_type;

ALTER TABLE public.facedesk_attendance_review_queue
  ADD CONSTRAINT chk_facedesk_review_issue_type
  CHECK (
    issue_type IN (
      'DUPLICATE_ENROLLMENT',
      'LOW_CONFIDENCE',
      'MULTIPLE_MATCH',
      'FACE_MISMATCH',
      'REPEATED_FAILURE',
      'MANUAL_CORRECTION'
    )
  );
