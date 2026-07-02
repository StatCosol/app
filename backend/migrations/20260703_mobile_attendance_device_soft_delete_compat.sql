-- Production compatibility for mobile_attendance_devices soft-delete support.
-- Some environments have the mobile attendance table but missed the older
-- deleted_at compatibility migration. Keep this idempotent and non-destructive.
DO $$
BEGIN
  IF to_regclass('public.mobile_attendance_devices') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.mobile_attendance_devices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ';
    EXECUTE 'ALTER TABLE public.mobile_attendance_devices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_mad_deleted_at ON public.mobile_attendance_devices(deleted_at)';
  END IF;
END $$;
