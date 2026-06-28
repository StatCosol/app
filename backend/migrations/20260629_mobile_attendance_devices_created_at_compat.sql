-- Compatibility for older production mobile_attendance_devices tables.
-- Some live databases were created before created_at was added to the device entity.
ALTER TABLE mobile_attendance_devices
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

