-- CI patch for payroll transition smoke schema compatibility
-- Safe/idempotent additive updates on top of legacy payroll migrations.

BEGIN;

-- payroll_component_rules: align with current entity
ALTER TABLE IF EXISTS payroll_component_rules
  ADD COLUMN IF NOT EXISTS client_id UUID,
  ADD COLUMN IF NOT EXISTS effective_from DATE,
  ADD COLUMN IF NOT EXISTS effective_to DATE;

CREATE INDEX IF NOT EXISTS idx_pcr_client_id ON payroll_component_rules (client_id);

UPDATE payroll_component_rules r
SET client_id = c.client_id
FROM payroll_components c
WHERE r.component_id = c.id
  AND r.client_id IS NULL;

-- payroll_component_slabs: align with current entity
ALTER TABLE IF EXISTS payroll_component_slabs
  ADD COLUMN IF NOT EXISTS client_id UUID;

CREATE INDEX IF NOT EXISTS idx_pcs_client_id ON payroll_component_slabs (client_id);

UPDATE payroll_component_slabs s
SET client_id = c.client_id
FROM payroll_component_rules r
JOIN payroll_components c ON r.component_id = c.id
WHERE s.rule_id = r.id
  AND s.client_id IS NULL;

-- payroll_runs: approval workflow columns expected by current service/entity
ALTER TABLE IF EXISTS payroll_runs
  ADD COLUMN IF NOT EXISTS submitted_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_comments TEXT,
  ADD COLUMN IF NOT EXISTS rejected_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- payroll_client_setup: setup tab fields expected by current entity
ALTER TABLE IF EXISTS payroll_client_setup
  ADD COLUMN IF NOT EXISTS effective_from DATE,
  ADD COLUMN IF NOT EXISTS cycle_start_day INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS payout_day INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lock_day INT NOT NULL DEFAULT 26,
  ADD COLUMN IF NOT EXISTS arrear_mode VARCHAR(20) NOT NULL DEFAULT 'CURRENT',
  ADD COLUMN IF NOT EXISTS leave_accrual_per_month NUMERIC(6,2) NOT NULL DEFAULT 1.50,
  ADD COLUMN IF NOT EXISTS max_carry_forward INT NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS allow_carry_forward BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS lop_mode VARCHAR(20) NOT NULL DEFAULT 'PRORATED',
  ADD COLUMN IF NOT EXISTS attendance_source VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS attendance_cutoff_day INT NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS grace_minutes INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS auto_lock_attendance BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS enable_loan_recovery BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS enable_advance_recovery BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS default_deduction_cap_pct NUMERIC(6,2) NOT NULL DEFAULT 50.00,
  ADD COLUMN IF NOT EXISTS recovery_order VARCHAR(220) NOT NULL DEFAULT 'STATUTORY > LOAN > ADVANCE > OTHER';

COMMIT;
