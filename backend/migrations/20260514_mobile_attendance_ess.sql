-- Mobile attendance ESS extension: bind an ESS device to a single employee
-- so on-device self-enrollment + 1:1 verify can use that employee identity.
-- Idempotent.

ALTER TABLE mobile_attendance_devices
  ADD COLUMN IF NOT EXISTS ess_employee_id uuid NULL;

CREATE INDEX IF NOT EXISTS ix_mobile_devices_ess_emp
  ON mobile_attendance_devices (ess_employee_id)
  WHERE ess_employee_id IS NOT NULL;
