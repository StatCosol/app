-- Add device_label column to allow admins to rename kiosk devices
-- without changing the android_id or device_name stored during registration
ALTER TABLE mobile_attendance_devices
  ADD COLUMN IF NOT EXISTS device_label VARCHAR(200) DEFAULT NULL;
