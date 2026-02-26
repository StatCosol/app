-- SLA Tasks table
CREATE TABLE IF NOT EXISTS sla_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  branch_id uuid NULL,
  module varchar(30) NOT NULL,             -- REGISTRATION/MCD/RETURNS/AUDIT
  entity_id uuid NULL,
  title text NOT NULL,
  priority varchar(15) NOT NULL DEFAULT 'MEDIUM',   -- LOW/MEDIUM/HIGH/CRITICAL
  due_date date NOT NULL,
  assigned_to_user_id uuid NULL,
  status varchar(20) NOT NULL DEFAULT 'OPEN',       -- OPEN/IN_PROGRESS/CLOSED/OVERDUE
  closed_at timestamp NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  deleted_at timestamp NULL
);

CREATE INDEX IF NOT EXISTS idx_sla_tasks_client ON sla_tasks (client_id);
CREATE INDEX IF NOT EXISTS idx_sla_tasks_branch ON sla_tasks (branch_id);
CREATE INDEX IF NOT EXISTS idx_sla_tasks_status ON sla_tasks (status);
CREATE INDEX IF NOT EXISTS idx_sla_tasks_due_date ON sla_tasks (due_date);
