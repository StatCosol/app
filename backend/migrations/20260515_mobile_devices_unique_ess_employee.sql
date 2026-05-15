-- Enforce one active ESS device per employee per client.
-- Prevents the same employee code from being bound to multiple personal phones,
-- which would let one person punch from multiple devices simultaneously.
-- Idempotent.

CREATE UNIQUE INDEX IF NOT EXISTS uq_mobile_devices_active_ess_emp
  ON mobile_attendance_devices (client_id, ess_employee_id)
  WHERE ess_employee_id IS NOT NULL AND is_active = true;
