-- Performance indexes for LegitX Compliance Status dashboard
-- Date: 2026-02-17
-- These indexes optimize the compliance-status controller queries
-- which filter by period_year, period_month, client_id, branch_id

-- ──────────────────────────────────
-- COMPLIANCE TASKS - period scoping
-- ──────────────────────────────────

-- Primary query pattern: WHERE period_year = ? AND period_month = ? AND client_id = ?
CREATE INDEX IF NOT EXISTS idx_compliance_tasks_period_client
  ON compliance_tasks(period_year, period_month, client_id);

-- Branch-level drill-down
CREATE INDEX IF NOT EXISTS idx_compliance_tasks_branch_period
  ON compliance_tasks(branch_id, period_year, period_month);

-- Status + due_date for overdue detection
CREATE INDEX IF NOT EXISTS idx_compliance_tasks_status_due
  ON compliance_tasks(status, due_date)
  WHERE status IN ('PENDING', 'IN_PROGRESS');

-- ──────────────────────────────────
-- COMPLIANCE RETURNS - period scoping
-- ──────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_compliance_returns_period_client
  ON compliance_returns(period_year, period_month, client_id);

CREATE INDEX IF NOT EXISTS idx_compliance_returns_branch_period
  ON compliance_returns(branch_id, period_year, period_month);

-- Overdue returns detection
CREATE INDEX IF NOT EXISTS idx_compliance_returns_unfiled_due
  ON compliance_returns(due_date)
  WHERE filed_date IS NULL AND status NOT IN ('REJECTED');

-- ──────────────────────────────────
-- AUDIT OBSERVATIONS - risk filtering
-- ──────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_audit_observations_audit_risk_status
  ON audit_observations(audit_id, risk, status);

-- Open observations for compliance risk calculation
CREATE INDEX IF NOT EXISTS idx_audit_observations_open
  ON audit_observations(risk)
  WHERE status IN ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS');

-- ──────────────────────────────────
-- AUDITS - period scoping
-- ──────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_audits_period_year_client
  ON audits(period_year, client_id);

-- ──────────────────────────────────
-- CONTRACTOR DOCUMENTS - compliance %
-- ──────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_contractor_documents_contractor_branch
  ON contractor_documents(contractor_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_contractor_documents_status
  ON contractor_documents(status);

-- ──────────────────────────────────
-- CLIENT BRANCHES - dashboard meta
-- ──────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_client_branches_client_active
  ON client_branches(clientid)
  WHERE isdeleted = false AND isactive = true;

-- ──────────────────────────────────
-- BRANCH COMPLIANCES - ranking
-- ──────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_branch_compliances_branch_status
  ON branch_compliances(branch_id, status);

-- ──────────────────────────────────
-- HR MONTHLY SNAPSHOT - dashboard KPIs
-- ──────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_branch_hr_monthly_snapshot_period
  ON branch_hr_monthly_snapshot(year, month, branch_id);
