-- FaceDesk kiosk admin PINs are bcrypt hashes (72 chars), not plaintext digits.
-- Existing plaintext rows remain valid until the device is re-provisioned.

ALTER TABLE facedesk_kiosk_devices
  ALTER COLUMN admin_pin TYPE varchar(72);
