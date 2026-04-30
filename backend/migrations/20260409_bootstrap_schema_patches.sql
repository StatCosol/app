-- Migration: 20260409_bootstrap_schema_patches.sql
-- Consolidates all one-time schema patches previously in main.ts bootstrap().
-- Each block is idempotent (IF NOT EXISTS / conditional checks).

-- ── 1. Dedup compliance_tasks & add unique constraint ──────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'UQ_CT_CLIENT_BRANCH_COMPLIANCE_PERIOD'
  ) THEN
    DELETE FROM compliance_tasks
    WHERE id NOT IN (
      SELECT MIN(id)
      FROM compliance_tasks
      GROUP BY client_id, branch_id, compliance_id, period_year, period_month, frequency
    );
    CREATE UNIQUE INDEX "UQ_CT_CLIENT_BRANCH_COMPLIANCE_PERIOD"
      ON compliance_tasks (client_id, branch_id, compliance_id, period_year, period_month, frequency);
  END IF;
END $$;

-- ── 2. employee_nominations: workflow columns ──────────────────────
ALTER TABLE employee_nominations
  ADD COLUMN IF NOT EXISTS client_id           UUID,
  ADD COLUMN IF NOT EXISTS branch_id           UUID,
  ADD COLUMN IF NOT EXISTS submitted_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS rejection_reason    TEXT;

-- Backfill client_id / branch_id from employees
UPDATE employee_nominations en
SET client_id  = e.client_id,
    branch_id  = e.branch_id
FROM employees e
WHERE en.employee_id = e.id
  AND en.client_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_emp_nom_client   ON employee_nominations (client_id);
CREATE INDEX IF NOT EXISTS idx_emp_nom_branch   ON employee_nominations (branch_id);
CREATE INDEX IF NOT EXISTS idx_emp_nom_status   ON employee_nominations (status);
CREATE INDEX IF NOT EXISTS idx_emp_nom_approver ON employee_nominations (approved_by_user_id);

-- ── 3. attendance_records: approval columns ────────────────────────
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS approval_status      VARCHAR(20) DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS approved_by_user_id  UUID,
  ADD COLUMN IF NOT EXISTS approved_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason     TEXT;

CREATE INDEX IF NOT EXISTS idx_att_approval_status ON attendance_records (approval_status);
CREATE INDEX IF NOT EXISTS idx_att_approved_by     ON attendance_records (approved_by_user_id);

UPDATE attendance_records
SET approval_status = 'APPROVED'
WHERE self_marked = false AND approval_status = 'PENDING';

-- ── 4. employees: ctc column ───────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS ctc NUMERIC(12,2);

-- ── 5. pay_calc_traces: structure_id & rule_set_id ─────────────────
ALTER TABLE pay_calc_traces
  ADD COLUMN IF NOT EXISTS structure_id UUID,
  ADD COLUMN IF NOT EXISTS rule_set_id  UUID;

-- ── 6. compliance_returns: widen period_label ──────────────────────
DO $$
DECLARE
  cur_len INT;
BEGIN
  SELECT character_maximum_length INTO cur_len
  FROM information_schema.columns
  WHERE table_name = 'compliance_returns' AND column_name = 'period_label';
  IF cur_len IS NOT NULL AND cur_len < 200 THEN
    ALTER TABLE compliance_returns ALTER COLUMN period_label TYPE VARCHAR(200);
  END IF;
END $$;

-- ── 7. CRM "Acting on Behalf" columns ─────────────────────────────
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS crm_on_behalf_enabled BOOLEAN DEFAULT false;

ALTER TABLE compliance_documents
  ADD COLUMN IF NOT EXISTS uploaded_by_role   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS acting_on_behalf    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_owner_role VARCHAR(20);

ALTER TABLE branch_documents
  ADD COLUMN IF NOT EXISTS uploaded_by_role   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS acting_on_behalf    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_owner_role VARCHAR(20);

ALTER TABLE contractor_documents
  ADD COLUMN IF NOT EXISTS uploaded_by_role   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS acting_on_behalf    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_owner_role VARCHAR(20);

ALTER TABLE crm_unit_documents
  ADD COLUMN IF NOT EXISTS uploaded_by_role   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS acting_on_behalf    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_owner_role VARCHAR(20);

ALTER TABLE compliance_returns
  ADD COLUMN IF NOT EXISTS uploaded_by_role   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS acting_on_behalf    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_owner_role VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_cd_acting_on_behalf ON compliance_documents (acting_on_behalf) WHERE acting_on_behalf = true;
CREATE INDEX IF NOT EXISTS idx_bd_acting_on_behalf ON branch_documents (acting_on_behalf) WHERE acting_on_behalf = true;
CREATE INDEX IF NOT EXISTS idx_cr_acting_on_behalf ON compliance_returns (acting_on_behalf) WHERE acting_on_behalf = true;
