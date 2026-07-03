-- Production compatibility for liveness challenge nonce inserts.
--
-- Some upgraded databases may still have legacy subject-scope columns on
-- face_liveness_nonces. The current code stores nonces by device/challenge only;
-- any legacy NOT NULL column such as employee_id makes POST
-- /mobile-attendance/liveness/challenge fail with pg 23502.

DO $$
BEGIN
  IF to_regclass('public.face_liveness_nonces') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'face_liveness_nonces'
         AND column_name = 'employee_id'
    ) THEN
      ALTER TABLE face_liveness_nonces ALTER COLUMN employee_id DROP NOT NULL;
    END IF;

    IF EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'face_liveness_nonces'
         AND column_name = 'contractor_employee_id'
    ) THEN
      ALTER TABLE face_liveness_nonces ALTER COLUMN contractor_employee_id DROP NOT NULL;
    END IF;

    IF EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'face_liveness_nonces'
         AND column_name = 'subject_id'
    ) THEN
      ALTER TABLE face_liveness_nonces ALTER COLUMN subject_id DROP NOT NULL;
    END IF;

    IF EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'face_liveness_nonces'
         AND column_name = 'client_id'
    ) THEN
      ALTER TABLE face_liveness_nonces ALTER COLUMN client_id DROP NOT NULL;
    END IF;

    IF EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'face_liveness_nonces'
         AND column_name = 'branch_id'
    ) THEN
      ALTER TABLE face_liveness_nonces ALTER COLUMN branch_id DROP NOT NULL;
    END IF;
  END IF;
END $$;
