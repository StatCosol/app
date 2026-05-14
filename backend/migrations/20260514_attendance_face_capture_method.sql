-- Backfill: attendance rows whose punches all came from the mobile face kiosk
-- should report capture_method = 'FACE' so the UI can distinguish them from
-- fingerprint biometric devices. Leaves source = 'BIOMETRIC' (broader bucket).

UPDATE attendance_records a
   SET capture_method = 'FACE'
 WHERE a.source = 'BIOMETRIC'
   AND a.capture_method IS DISTINCT FROM 'FACE'
   AND EXISTS (
     SELECT 1 FROM biometric_punches bp
      WHERE bp.attendance_id = a.id
   )
   AND NOT EXISTS (
     SELECT 1 FROM biometric_punches bp
      WHERE bp.attendance_id = a.id
        AND bp.source NOT IN ('MOBILE_KIOSK', 'MOBILE_ESS')
   );
