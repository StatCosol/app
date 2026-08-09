-- Retire ESS Mobile Attendance (personal-phone biometric) as a client module.
-- FaceDesk kiosk + ESS portal self-punch remain the supported attendance paths.

DELETE FROM client_module_entitlements
 WHERE module_code = 'MOBILE_ATTENDANCE';

-- Revoke personal-phone ESS devices so install tokens stop authenticating.
-- Kiosk devices (mode = KIOSK) remain active for FaceDesk.
UPDATE mobile_attendance_devices
   SET is_active = false,
       revoked_at = COALESCE(revoked_at, now())
 WHERE mode = 'ESS'
   AND COALESCE(is_active, true) = true
   AND deleted_at IS NULL;
