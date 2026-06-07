-- Allow contractor employee registration deletion requests to mark workers as
-- pending branch approval before final inactivation.

ALTER TABLE contractor_employees
  DROP CONSTRAINT IF EXISTS chk_ce_status;

ALTER TABLE contractor_employees
  ADD CONSTRAINT chk_ce_status
  CHECK (status IN ('ACTIVE', 'LEFT', 'INACTIVE', 'PENDING_DELETE'));
