-- Migration: Automation task engine + audit schedules
-- Date: 2026-03-26
-- Purpose: Add system_tasks universal table, audit_schedules, add due_date to NCs

BEGIN;

-- ──────────────────────────────────────────────────
-- 1. system_tasks — Universal task engine table
-- ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type       VARCHAR(50)  NOT NULL,           -- COMPLIANCE | AUDIT_NC | RENEWAL | REUPLOAD | MONTHLY | SAFETY
  module          VARCHAR(30)  NOT NULL,           -- AUDIT | COMPLIANCE | RETURNS | RENEWAL | SAFETY | PAYROLL
  reference_id    UUID,                            -- FK to source record (NC id, compliance item id, etc.)
  reference_type  VARCHAR(50),                     -- AUDIT_NON_COMPLIANCE | MONTHLY_ITEM | REGISTRATION | LICENSE
  client_id       UUID REFERENCES clients(id) ON DELETE CASCADE,
  branch_id       UUID REFERENCES client_branches(id) ON DELETE SET NULL,
  contractor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_role   VARCHAR(30)  NOT NULL,           -- ADMIN | CRM | AUDITOR | CLIENT | BRANCH | CONTRACTOR
  assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title           VARCHAR(500) NOT NULL,
  description     TEXT,
  due_date        DATE,
  priority        VARCHAR(10) NOT NULL DEFAULT 'MEDIUM',  -- LOW | MEDIUM | HIGH | CRITICAL
  status          VARCHAR(20) NOT NULL DEFAULT 'OPEN',    -- OPEN | IN_PROGRESS | AWAITING_REUPLOAD | REUPLOADED | CLOSED | CANCELLED
  created_by_system BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_systask_status     ON system_tasks(status);
CREATE INDEX IF NOT EXISTS idx_systask_assigned   ON system_tasks(assigned_user_id, status);
CREATE INDEX IF NOT EXISTS idx_systask_role       ON system_tasks(assigned_role, status);
CREATE INDEX IF NOT EXISTS idx_systask_client     ON system_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_systask_branch     ON system_tasks(branch_id);
CREATE INDEX IF NOT EXISTS idx_systask_ref        ON system_tasks(reference_id, reference_type);
CREATE INDEX IF NOT EXISTS idx_systask_due        ON system_tasks(due_date) WHERE status IN ('OPEN','IN_PROGRESS','AWAITING_REUPLOAD');

-- ──────────────────────────────────────────────────
-- 2. audit_schedules — Auto-generated audit schedule
-- ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_schedules (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  audit_type           VARCHAR(30) NOT NULL,        -- BRANCH_AUDIT | CONTRACTOR_AUDIT
  branch_id            UUID REFERENCES client_branches(id) ON DELETE SET NULL,
  contractor_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  auditor_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_by_crm_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  scheduled_by_system  BOOLEAN NOT NULL DEFAULT FALSE,
  schedule_date        DATE NOT NULL,
  due_date             DATE,
  frequency            VARCHAR(20),                 -- MONTHLY | QUARTERLY | SEMI_ANNUAL | ANNUAL
  status               VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED', -- SCHEDULED | IN_PROGRESS | COMPLETED | CANCELLED
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audsched_client   ON audit_schedules(client_id);
CREATE INDEX IF NOT EXISTS idx_audsched_auditor  ON audit_schedules(auditor_id);
CREATE INDEX IF NOT EXISTS idx_audsched_status   ON audit_schedules(status);
CREATE INDEX IF NOT EXISTS idx_audsched_date     ON audit_schedules(schedule_date);

-- ──────────────────────────────────────────────────
-- 3. Add due_date to audit_non_compliances
-- ──────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_non_compliances' AND column_name = 'due_date'
  ) THEN
    ALTER TABLE audit_non_compliances ADD COLUMN due_date DATE;
  END IF;
END $$;

COMMIT;
