-- Add soft-delete marker for mobile attendance devices.
-- Used when historical attendance/ticket references prevent physical deletion.
ALTER TABLE mobile_attendance_devices
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_mad_deleted_at
  ON mobile_attendance_devices(deleted_at);
