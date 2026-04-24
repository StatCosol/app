-- ============================================================================
-- Admin Hardening: DB Constraints & Indexes for Production Safety
-- Run: psql -h localhost -U postgres -d statco_dev -f migrations/20260226_admin_hardening_constraints.sql
-- ============================================================================

-- ── 1. Roles: ensure code is unique ──────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'uq_roles_code'
  ) THEN
    CREATE UNIQUE INDEX uq_roles_code ON roles (LOWER(code));
  END IF;
END $$;

-- Seed all required roles (idempotent)
INSERT INTO roles (id, code, name) VALUES
  (gen_random_uuid(), 'ADMIN',      'Administrator'),
  (gen_random_uuid(), 'CEO',        'Chief Executive Officer'),
  (gen_random_uuid(), 'CCO',        'Chief Compliance Officer'),
  (gen_random_uuid(), 'CRM',        'Compliance Relationship Manager'),
  (gen_random_uuid(), 'CLIENT',     'Client User'),
  (gen_random_uuid(), 'PAYROLL',    'Payroll Manager'),
  (gen_random_uuid(), 'EMPLOYEE',   'Employee (ESS)'),
  (gen_random_uuid(), 'AUDITOR',    'Auditor'),
  (gen_random_uuid(), 'CONTRACTOR', 'Contractor'),
  (gen_random_uuid(), 'PF_TEAM',    'PF Team')
ON CONFLICT DO NOTHING;

-- ── 2. Client-CRM / Client-Auditor assignment uniqueness ────────────────────
-- The entity already defines @Index(['clientId', 'assignmentType'], { unique: true })
-- on client_assignments_current. Ensure DB has it:
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_clientassignmentscurrent_clientid_assignmenttype'
       OR indexname = 'uq_assignment_current_client_type'
  ) THEN
    CREATE UNIQUE INDEX uq_assignment_current_client_type
      ON client_assignments_current (client_id, assignment_type);
  END IF;
END $$;

-- ── 3. Branch uniqueness: (client_id, branch_name) for non-deleted ──────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'uq_branch_name_per_client'
  ) THEN
    CREATE UNIQUE INDEX uq_branch_name_per_client
      ON client_branches (clientid, LOWER(branchname))
      WHERE isdeleted = false;
  END IF;
END $$;

-- ── 4. User email uniqueness for non-deleted users ──────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'uq_users_email_active'
  ) THEN
    CREATE UNIQUE INDEX uq_users_email_active
      ON users (LOWER(email))
      WHERE deleted_at IS NULL AND email IS NOT NULL;
  END IF;
END $$;

-- ── 5. User mobile uniqueness for non-deleted users ─────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'uq_users_mobile_active'
  ) THEN
    CREATE UNIQUE INDEX uq_users_mobile_active
      ON users (mobile)
      WHERE deleted_at IS NULL AND mobile IS NOT NULL AND mobile != '';
  END IF;
END $$;

-- ── 6. user_branches junction uniqueness ────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'uq_user_branch_unique'
  ) THEN
    CREATE UNIQUE INDEX uq_user_branch_unique
      ON user_branches (user_id, branch_id);
  END IF;
END $$;

-- ── 7. Audit logs indexes for admin search ──────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_audit_logs_created_at'
  ) THEN
    CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_audit_logs_actor_created'
  ) THEN
    CREATE INDEX idx_audit_logs_actor_created ON audit_logs (performed_by, created_at DESC);
  END IF;
END $$;

-- ── 8. Client code uniqueness (partial index for non-deleted) ───────────────
-- ClientEntity already has unique: true on client_code column.
-- Add partial index for soft-delete safety:
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'uq_client_code_active'
  ) THEN
    CREATE UNIQUE INDEX uq_client_code_active
      ON clients (LOWER(client_code))
      WHERE is_deleted = false;
  END IF;
END $$;

-- ── 9. Add enterprise fields to clients (if missing) ────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS registered_address TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS state VARCHAR(50);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS industry VARCHAR(100);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS primary_contact_name VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS primary_contact_email VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS primary_contact_mobile VARCHAR(20);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS company_code VARCHAR(30);

-- ── 10. Performance indexes ─────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_clients_is_deleted'
  ) THEN
    CREATE INDEX idx_clients_is_deleted ON clients (is_deleted);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_branches_client_deleted'
  ) THEN
    CREATE INDEX idx_branches_client_deleted ON client_branches (clientid, isdeleted);
  END IF;
END $$;

SELECT 'Admin hardening constraints applied successfully' AS result;
