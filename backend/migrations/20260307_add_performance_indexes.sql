-- Performance indexes for high-traffic tables
-- Run once in production

-- ── compliance_tasks ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "IDX_CT_CLIENT_STATUS"
  ON compliance_tasks (client_id, status);

CREATE INDEX IF NOT EXISTS "IDX_CT_BRANCH_STATUS"
  ON compliance_tasks (branch_id, status);

CREATE INDEX IF NOT EXISTS "IDX_CT_DUE_DATE"
  ON compliance_tasks (due_date);

CREATE INDEX IF NOT EXISTS "IDX_CT_ASSIGNED_TO"
  ON compliance_tasks (assigned_to_user_id);

CREATE INDEX IF NOT EXISTS "IDX_CT_COMPLIANCE"
  ON compliance_tasks (compliance_id);

-- ── notifications ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "IDX_NOTIF_CLIENT"
  ON notifications (client_id);

CREATE INDEX IF NOT EXISTS "IDX_NOTIF_BRANCH"
  ON notifications (branch_id);

CREATE INDEX IF NOT EXISTS "IDX_NOTIF_CREATED_BY"
  ON notifications (created_by_user_id);

CREATE INDEX IF NOT EXISTS "IDX_NOTIF_ASSIGNED_TO"
  ON notifications (assigned_to_user_id);

CREATE INDEX IF NOT EXISTS "IDX_NOTIF_STATUS"
  ON notifications (status);

CREATE INDEX IF NOT EXISTS "IDX_NOTIF_PRIORITY"
  ON notifications (priority);

CREATE INDEX IF NOT EXISTS "IDX_NOTIF_QUERY_TYPE"
  ON notifications (query_type);

CREATE INDEX IF NOT EXISTS "IDX_NOTIF_CREATED_AT"
  ON notifications (created_at);

CREATE INDEX IF NOT EXISTS "IDX_NOTIF_CLIENT_STATUS"
  ON notifications (client_id, status);

CREATE INDEX IF NOT EXISTS "IDX_NOTIF_ASSIGNED_STATUS"
  ON notifications (assigned_to_user_id, status);

-- ── employees ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "IDX_EMP_CLIENT_BRANCH"
  ON employees (client_id, branch_id);

CREATE INDEX IF NOT EXISTS "IDX_EMP_CLIENT_ACTIVE"
  ON employees (client_id, is_active);

CREATE INDEX IF NOT EXISTS "IDX_EMP_APPROVAL"
  ON employees (approval_status);

CREATE INDEX IF NOT EXISTS "IDX_EMP_AADHAAR"
  ON employees (aadhaar);

-- ── payroll_runs ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "IDX_PR_CLIENT_STATUS"
  ON payroll_runs (client_id, status);

CREATE INDEX IF NOT EXISTS "IDX_PR_CLIENT_PERIOD"
  ON payroll_runs (client_id, period_year, period_month);

CREATE INDEX IF NOT EXISTS "IDX_PR_BRANCH_PERIOD"
  ON payroll_runs (branch_id, period_year, period_month);

CREATE INDEX IF NOT EXISTS "IDX_PR_STATUS"
  ON payroll_runs (status);

-- ── audit_observations ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "IDX_AO_AUDIT"
  ON audit_observations (audit_id);

CREATE INDEX IF NOT EXISTS "IDX_AO_CATEGORY"
  ON audit_observations (category_id);

CREATE INDEX IF NOT EXISTS "IDX_AO_STATUS"
  ON audit_observations (status);

CREATE INDEX IF NOT EXISTS "IDX_AO_RISK"
  ON audit_observations (risk);

CREATE INDEX IF NOT EXISTS "IDX_AO_RECORDED_BY"
  ON audit_observations (recorded_by_user_id);

-- ── cron_execution_logs ───────────────────────────────────────
-- Table created in 20260307_cron_execution_logs.sql (with entity-matching column names)
-- Only add indexes here if not already present
CREATE INDEX IF NOT EXISTS "IDX_CRON_LOG_JOB"
  ON cron_execution_logs ("jobName");

CREATE INDEX IF NOT EXISTS "IDX_CRON_LOG_STARTED"
  ON cron_execution_logs ("startedAt");
