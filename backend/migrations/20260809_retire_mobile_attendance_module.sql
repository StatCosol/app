-- Retire ESS Mobile Attendance (personal-phone biometric) as a client module.
-- FaceDesk kiosk + ESS portal self-punch remain the supported attendance paths.

DELETE FROM client_module_entitlements
 WHERE module_code = 'MOBILE_ATTENDANCE';
