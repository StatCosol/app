-- Ensure users.employee_id exists for auth JWT strategy payload mapping.
-- Safe to run multiple times.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS employee_id UUID NULL;

CREATE INDEX IF NOT EXISTS idx_users_employee_id
  ON users (employee_id);
