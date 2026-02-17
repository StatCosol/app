-- Migration to transform old client_assignments structure to new governance model
-- Run this AFTER backing up your data

-- Step 1: Backup existing assignments to temporary table
CREATE TEMP TABLE old_assignments AS 
SELECT * FROM client_assignments;

-- Ensure expected columns exist on snapshot
ALTER TABLE old_assignments ADD COLUMN IF NOT EXISTS crm_user_id UUID;
ALTER TABLE old_assignments ADD COLUMN IF NOT EXISTS auditor_user_id UUID;
ALTER TABLE old_assignments ADD COLUMN IF NOT EXISTS start_date DATE;

-- Step 2: Drop old structure
DROP TABLE IF EXISTS client_assignments CASCADE;
DROP TABLE IF EXISTS client_assignment_current CASCADE;

-- Step 3: Create new structure
CREATE TABLE client_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  assignment_type  TEXT NOT NULL,  -- CRM | AUDITOR
  assigned_user_id UUID NOT NULL REFERENCES users(id),
  assigned_on      DATE NOT NULL DEFAULT CURRENT_DATE,
  rotation_due_on  DATE NOT NULL,
  status           TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | INACTIVE | OVERDUE_ROTATION
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ,
  
  CONSTRAINT chk_assignment_type CHECK (assignment_type IN ('CRM', 'AUDITOR')),
  CONSTRAINT chk_assignment_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'OVERDUE_ROTATION'))
);

-- Step 4: Migrate CRM assignments from old structure
INSERT INTO client_assignments (
  client_id, 
  assignment_type, 
  assigned_user_id, 
  assigned_on,
  rotation_due_on,
  status, 
  created_at
)
SELECT 
  client_id,
  'CRM' AS assignment_type,
  crm_user_id,
  COALESCE(start_date, created_at::date) AS assigned_on,
  COALESCE(start_date, created_at::date) + INTERVAL '2 years' AS rotation_due_on,
  status,
  created_at
FROM old_assignments
WHERE crm_user_id IS NOT NULL;

-- Step 5: Migrate AUDITOR assignments from old structure
INSERT INTO client_assignments (
  client_id, 
  assignment_type, 
  assigned_user_id, 
  assigned_on,
  rotation_due_on,
  status, 
  created_at
)
SELECT 
  client_id,
  'AUDITOR' AS assignment_type,
  auditor_user_id,
  COALESCE(start_date, created_at::date) AS assigned_on,
  COALESCE(start_date, created_at::date) + INTERVAL '3 years' AS rotation_due_on,
  status,
  created_at
FROM old_assignments
WHERE auditor_user_id IS NOT NULL;

-- Step 6: Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS ux_client_assignments_active
ON client_assignments (client_id, assignment_type)
WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_client_assignments_user ON client_assignments(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_client_assignments_due ON client_assignments(rotation_due_on) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_client_assignments_type_status ON client_assignments(assignment_type, status);

-- Step 7: Create assignment history table
CREATE TABLE IF NOT EXISTS client_assignment_history (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  assignment_type  TEXT NOT NULL,
  assigned_user_id UUID NOT NULL REFERENCES users(id),
  assigned_on      DATE NOT NULL,
  ended_on         DATE NOT NULL,
  ended_reason     TEXT NOT NULL, -- ROTATION | REPLACEMENT | TERMINATION
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT chk_history_assignment_type CHECK (assignment_type IN ('CRM', 'AUDITOR')),
  CONSTRAINT chk_history_ended_reason CHECK (ended_reason IN ('ROTATION', 'REPLACEMENT', 'TERMINATION'))
);

CREATE INDEX IF NOT EXISTS idx_assignment_history_client ON client_assignment_history(client_id);
CREATE INDEX IF NOT EXISTS idx_assignment_history_user ON client_assignment_history(assigned_user_id);

COMMENT ON TABLE client_assignments IS 'Current active CRM/Auditor assignments with rotation tracking';
COMMENT ON TABLE client_assignment_history IS 'Complete audit trail of all past assignments';

-- Verification query
SELECT 
  assignment_type,
  COUNT(*) as count,
  COUNT(DISTINCT client_id) as unique_clients,
  COUNT(DISTINCT assigned_user_id) as unique_users
FROM client_assignments
GROUP BY assignment_type;
