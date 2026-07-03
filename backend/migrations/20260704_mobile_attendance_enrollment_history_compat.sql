-- Align legacy face_enrollment_history tables with the current enrollment
-- history entity. Some production databases have the pre-contractor version
-- of this table, which breaks kiosk enrollment when TypeORM writes the
-- contractor_employee_id column.

DO $$
BEGIN
  IF to_regclass('public.face_enrollment_history') IS NOT NULL THEN
    ALTER TABLE face_enrollment_history
      ADD COLUMN IF NOT EXISTS contractor_employee_id UUID,
      ADD COLUMN IF NOT EXISTS reason TEXT,
      ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(40),
      ADD COLUMN IF NOT EXISTS actor_user_id UUID,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

    ALTER TABLE face_enrollment_history
      ALTER COLUMN employee_id DROP NOT NULL,
      ALTER COLUMN contractor_employee_id DROP NOT NULL,
      ALTER COLUMN reason DROP NOT NULL,
      ALTER COLUMN embedding_model DROP NOT NULL,
      ALTER COLUMN actor_user_id DROP NOT NULL;

    UPDATE face_enrollment_history
       SET created_at = now()
     WHERE created_at IS NULL;

    ALTER TABLE face_enrollment_history
      ALTER COLUMN created_at SET DEFAULT now(),
      ALTER COLUMN created_at SET NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_feh_employee
      ON face_enrollment_history(employee_id);

    CREATE INDEX IF NOT EXISTS idx_feh_contractor
      ON face_enrollment_history(contractor_employee_id);
  END IF;
END $$;
