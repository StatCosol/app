-- Migration: task_approval_history table for compliance workflow approvals
-- Date: 2026-03-27

CREATE TABLE IF NOT EXISTS task_approval_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type     VARCHAR(40)  NOT NULL,           -- RETURN | RENEWAL
  task_id       UUID         NOT NULL,
  stage         VARCHAR(60)  NOT NULL,           -- SUBMITTED | CRM_REVIEW | APPROVED | FINALIZED
  decision      VARCHAR(40)  NOT NULL,           -- APPROVED | REJECTED | RETURNED
  actor_user_id UUID,
  actor_name    VARCHAR(120),
  actor_role    VARCHAR(40),
  remarks       TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_approval_history_task
  ON task_approval_history (task_type, task_id);

CREATE INDEX IF NOT EXISTS idx_task_approval_history_actor
  ON task_approval_history (actor_user_id);

-- Extend audit_logs entity_type and action VARCHAR widths if needed
-- (no-op if already wide enough; Postgres allows VARCHAR expansion without table rewrite)
ALTER TABLE audit_logs
  ALTER COLUMN entity_type TYPE VARCHAR(80),
  ALTER COLUMN action TYPE VARCHAR(80);
