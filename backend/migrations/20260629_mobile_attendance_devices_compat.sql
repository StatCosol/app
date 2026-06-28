-- Mobile attendance device compatibility columns.
-- Some production databases were created before the v2 device schema used
-- device_name/deleted_at/geofence fields. Keep this as an additive migration so
-- deployments do not depend on request-time DDL or destructive table rebuilds.

ALTER TABLE mobile_attendance_devices
  ADD COLUMN IF NOT EXISTS device_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS geofence_lat NUMERIC,
  ADD COLUMN IF NOT EXISTS geofence_lng NUMERIC,
  ADD COLUMN IF NOT EXISTS geofence_radius_m INTEGER;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'mobile_attendance_devices'
       AND column_name = 'device_label'
  ) THEN
    UPDATE mobile_attendance_devices
       SET device_name = COALESCE(device_name, device_label)
     WHERE device_name IS NULL
       AND device_label IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mad_deleted_at
  ON mobile_attendance_devices(deleted_at);
