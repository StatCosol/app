-- Performance + scoping indexes for StatCo Comply
-- Date: 2026-02-02

-- ------------------
-- ASSIGNMENTS
-- ------------------

CREATE INDEX IF NOT EXISTS idx_client_assignments_crm
  ON client_assignments(crm_user_id);

CREATE INDEX IF NOT EXISTS idx_client_assignments_auditor
  ON client_assignments(auditor_user_id);

CREATE INDEX IF NOT EXISTS idx_client_assignments_status
  ON client_assignments(status);

CREATE INDEX IF NOT EXISTS idx_client_assignment_current_crm
  ON client_assignment_current(crm_user_id);

CREATE INDEX IF NOT EXISTS idx_client_assignment_current_auditor
  ON client_assignment_current(auditor_user_id);

CREATE INDEX IF NOT EXISTS idx_client_assignment_current_status
  ON client_assignment_current(status);

CREATE INDEX IF NOT EXISTS idx_client_assignment_history_client_created
  ON client_assignment_history(client_id, created_at);

-- ------------------
-- COMPLIANCE TASKS
-- ------------------

CREATE INDEX IF NOT EXISTS idx_compliance_tasks_client
  ON compliance_tasks(client_id);

CREATE INDEX IF NOT EXISTS idx_compliance_tasks_status
  ON compliance_tasks(status);

CREATE INDEX IF NOT EXISTS idx_compliance_tasks_due_date
  ON compliance_tasks(due_date);

CREATE INDEX IF NOT EXISTS idx_compliance_tasks_client_status_due
  ON compliance_tasks(client_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_compliance_comments_task_created
  ON compliance_comments(task_id, created_at);

CREATE INDEX IF NOT EXISTS idx_compliance_evidence_task_created
  ON compliance_evidence(task_id, created_at);

-- ------------------
-- AUDITS
-- ------------------

CREATE INDEX IF NOT EXISTS idx_audits_auditor
  ON audits(auditor_user_id);

CREATE INDEX IF NOT EXISTS idx_audits_status
  ON audits(status);

CREATE INDEX IF NOT EXISTS idx_audits_client_status
  ON audits(client_id, status);

CREATE INDEX IF NOT EXISTS idx_audits_dates
  ON audits(start_date, end_date);

-- ------------------
-- NOTIFICATIONS
-- ------------------

CREATE INDEX IF NOT EXISTS idx_notification_threads_from
  ON notification_threads(from_user_id);

CREATE INDEX IF NOT EXISTS idx_notification_threads_status
  ON notification_threads(status);

CREATE INDEX IF NOT EXISTS idx_notification_threads_to_status
  ON notification_threads(to_user_id, status);

-- message index is handled in 20260201_notification_reads.sql

-- ------------------
-- DELETION REQUESTS / APPROVALS
-- ------------------

CREATE INDEX IF NOT EXISTS idx_deletion_requests_approver_status
  ON deletion_requests(required_approver_user_id, status);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_entity
  ON deletion_requests(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_approvals_requested_to_status
  ON approvals(requested_to, status);

CREATE INDEX IF NOT EXISTS idx_approvals_entity
  ON approvals(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_deletion_audit_entity
  ON deletion_audit(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_deletion_audit_performed_by
  ON deletion_audit(performed_by);
