-- 2026-05-01 — per-client department contact directory
-- Lets admins maintain client-side recipient email lists per department
-- (ACCOUNTS, COMPLIANCE, CONTRACTOR_COMPLIANCE, HR, PAYROLL).
-- Used by monthly cron jobs (1st = payroll inputs, 16th = MCD data) and
-- by future targeted notifications.

DO $$ BEGIN
  CREATE TYPE client_contact_department AS ENUM (
    'ACCOUNTS',
    'COMPLIANCE',
    'CONTRACTOR_COMPLIANCE',
    'HR',
    'PAYROLL'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS client_department_contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  department  client_contact_department NOT NULL,
  name        VARCHAR(160) NOT NULL,
  email       VARCHAR(160) NOT NULL,
  phone       VARCHAR(40),
  designation VARCHAR(120),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  notes       TEXT,
  created_by  UUID,
  updated_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cdc_client_dept_email
  ON client_department_contacts (client_id, department, lower(email));

CREATE INDEX IF NOT EXISTS idx_cdc_client_dept_active
  ON client_department_contacts (client_id, department)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_cdc_dept_active
  ON client_department_contacts (department)
  WHERE is_active = TRUE;

-- Tracks per-client monthly comms runs so we never double-send in one month.
CREATE TABLE IF NOT EXISTS client_monthly_comm_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  comm_type    VARCHAR(40) NOT NULL,        -- PAYROLL_INPUT_REQUEST | MCD_REQUEST
  run_month    DATE NOT NULL,               -- first day of the month
  recipients   TEXT NOT NULL,               -- comma-joined emails actually sent to
  cc_emails    TEXT,
  status       VARCHAR(20) NOT NULL,        -- SENT | SKIPPED | FAILED
  failure_reason TEXT,
  triggered_by VARCHAR(40) NOT NULL DEFAULT 'CRON',
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cmcr_client_type_month
  ON client_monthly_comm_runs (client_id, comm_type, run_month);
