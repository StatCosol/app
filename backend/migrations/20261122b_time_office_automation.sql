CREATE TABLE IF NOT EXISTS time_office_automation_settings (
  client_id uuid PRIMARY KEY REFERENCES clients(id),
  enabled boolean NOT NULL DEFAULT true,
  starts_on date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  weekly_off_days integer[] NOT NULL DEFAULT ARRAY[0],
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id),
  last_run_at timestamptz,
  last_error text,
  CONSTRAINT time_office_weekdays CHECK (weekly_off_days <@ ARRAY[0,1,2,3,4,5,6])
);
CREATE TABLE IF NOT EXISTS time_office_followup_cases (
  client_id uuid NOT NULL REFERENCES clients(id),
  employee_id uuid NOT NULL REFERENCES employees(id),
  attendance_date date NOT NULL,
  reminded_at timestamptz,
  escalated_at timestamptz,
  resolved_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  PRIMARY KEY (client_id, employee_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS ix_time_office_pending_followups
  ON time_office_followup_cases(client_id, reminded_at) WHERE resolved_at IS NULL;
