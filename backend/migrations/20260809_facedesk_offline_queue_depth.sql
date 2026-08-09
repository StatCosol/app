-- Persist kiosk-reported offline queue depth for ops monitoring.
ALTER TABLE facedesk_kiosk_devices
  ADD COLUMN IF NOT EXISTS offline_queue_depth integer DEFAULT NULL;

COMMENT ON COLUMN facedesk_kiosk_devices.offline_queue_depth IS
  'Last reported depth of the encrypted offline punch queue on the device';
