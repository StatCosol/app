-- Performance indexes missing from the initial mobile attendance schema.
-- Safe to run multiple times (IF NOT EXISTS).

-- device_id on punch tables: deviceHasPunchHistory does WHERE device_id = ? AND client_id = ?
-- The existing indexes only cover (client_id, employee_id) and punch_time.
CREATE INDEX IF NOT EXISTS idx_map_device_id
  ON mobile_attendance_punches(device_id);

CREATE INDEX IF NOT EXISTS idx_cbp_device_id
  ON contractor_biometric_punches(device_id);

-- Partial index on face_liveness_nonces for the consumeNonce hot path:
-- WHERE nonce = ? AND device_id = ? AND consumed_at IS NULL AND expires_at > now()
CREATE INDEX IF NOT EXISTS idx_fln_nonce_device_active
  ON face_liveness_nonces(nonce, device_id)
  WHERE consumed_at IS NULL;
