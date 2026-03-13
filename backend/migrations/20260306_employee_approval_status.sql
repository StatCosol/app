-- Add approval_status column to employees table
-- PENDING = registered by branch user, awaiting client approval
-- APPROVED = approved by client user (or auto-approved when created by client)
-- REJECTED = rejected by client user

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'APPROVED';

-- Set any existing employees to APPROVED (they predate the approval workflow)
UPDATE employees SET approval_status = 'APPROVED' WHERE approval_status IS NULL;

-- Index for filtering by approval status
CREATE INDEX IF NOT EXISTS idx_employees_approval_status ON employees (approval_status);
