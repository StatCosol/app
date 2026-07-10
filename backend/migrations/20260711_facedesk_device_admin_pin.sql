-- FaceDesk V2: admin PIN per kiosk device. Gates switching a single device
-- between attendance (default) and enrollment mode, so one tablet does both
-- without needing separate hardware. Idempotent.

ALTER TABLE facedesk_kiosk_devices
  ADD COLUMN IF NOT EXISTS admin_pin varchar(12);
