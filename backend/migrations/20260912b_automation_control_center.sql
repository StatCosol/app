CREATE TABLE IF NOT EXISTS automation_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL CHECK (rule_key IN ('expiry','task_reminders','filing_overdue','nc_reminders')),
  client_id uuid NULL REFERENCES clients(id),
  branch_id uuid NULL REFERENCES client_branches(id),
  enabled boolean NOT NULL DEFAULT true,
  local_time varchar(5) NOT NULL CHECK (local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  version integer NOT NULL DEFAULT 1,
  updated_by uuid NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (branch_id IS NULL OR client_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_automation_control_scope ON automation_controls
  (rule_key,COALESCE(client_id,'00000000-0000-0000-0000-000000000000'::uuid),COALESCE(branch_id,'00000000-0000-0000-0000-000000000000'::uuid));
INSERT INTO automation_controls (rule_key,local_time)
VALUES ('expiry','07:00'),('task_reminders','08:00'),('filing_overdue','08:00'),('nc_reminders','09:00')
ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS automation_control_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  control_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES users(id),
  before_value jsonb NULL, after_value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), control_id uuid NOT NULL,
  rule_key text NOT NULL, request_key text NOT NULL UNIQUE,
  trigger_type text NOT NULL CHECK (trigger_type IN ('MANUAL','SCHEDULED','RETRY')),
  actor_id uuid NULL REFERENCES users(id), retry_of uuid NULL REFERENCES automation_runs(id),
  status text NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','PARTIAL','FAILED','INTERRUPTED')),
  snapshot jsonb NOT NULL, result jsonb NULL, error_message text NULL,
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz NULL
);
CREATE INDEX IF NOT EXISTS idx_automation_runs_recent ON automation_runs (started_at DESC,id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_running ON automation_runs (rule_key) WHERE status='RUNNING';