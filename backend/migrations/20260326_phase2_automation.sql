-- Phase 2 Automation: monthly_compliance_cycles, monthly_compliance_items, audit_frequency_rules
-- Also adds missing indexes on system_tasks and alters audit_schedules for new columns

-- ── monthly_compliance_cycles ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS monthly_compliance_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  month int NOT NULL,
  year int NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'OPEN',
  opened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcc_branch_month
  ON monthly_compliance_cycles(branch_id, month, year);

-- ── monthly_compliance_items ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS monthly_compliance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES monthly_compliance_cycles(id),
  compliance_id uuid NOT NULL,
  item_name varchar(255) NOT NULL,
  responsible_role varchar(30) NOT NULL DEFAULT 'BRANCH',
  due_date date,
  status varchar(30) NOT NULL DEFAULT 'PENDING',
  source_type varchar(20) NOT NULL DEFAULT 'SYSTEM',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mci_cycle
  ON monthly_compliance_items(cycle_id);

-- ── audit_frequency_rules ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_frequency_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  audit_type varchar(50) NOT NULL,
  frequency varchar(30) NOT NULL,
  branch_id uuid NULL,
  contractor_id uuid NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_frequency_rules_client
  ON audit_frequency_rules(client_id);

CREATE INDEX IF NOT EXISTS idx_audit_frequency_rules_type
  ON audit_frequency_rules(audit_type);

-- ── Extend audit_schedules with new columns ──────────────────────
ALTER TABLE audit_schedules
  ADD COLUMN IF NOT EXISTS contractor_id uuid NULL,
  ADD COLUMN IF NOT EXISTS frequency_rule_id uuid NULL,
  ADD COLUMN IF NOT EXISTS remarks text NULL;

CREATE INDEX IF NOT EXISTS idx_audit_schedules_auditor
  ON audit_schedules(auditor_id);

CREATE INDEX IF NOT EXISTS idx_audit_schedules_client
  ON audit_schedules(client_id);

CREATE INDEX IF NOT EXISTS idx_audit_schedules_schedule_date
  ON audit_schedules(schedule_date);

CREATE INDEX IF NOT EXISTS idx_audit_schedules_status
  ON audit_schedules(status);

-- ── Indexes on system_tasks ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_system_tasks_role
  ON system_tasks(assigned_role);
CREATE INDEX IF NOT EXISTS idx_system_tasks_client
  ON system_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_system_tasks_branch
  ON system_tasks(branch_id);
CREATE INDEX IF NOT EXISTS idx_system_tasks_contractor
  ON system_tasks(contractor_id);
CREATE INDEX IF NOT EXISTS idx_system_tasks_due_date
  ON system_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_system_tasks_status
  ON system_tasks(status);

-- ── Add schedule_id to audits table ──────────────────────────────
ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS schedule_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_audits_schedule_id
  ON audits(schedule_id);
