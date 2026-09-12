-- Existing computations remain unapproved drafts. No historical approval is inferred.
CREATE TABLE IF NOT EXISTS contractor_payroll_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  branch_id uuid,
  contractor_user_id uuid NOT NULL,
  period_month varchar(7) NOT NULL CHECK (period_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  version integer NOT NULL CHECK (version > 0),
  is_current boolean NOT NULL DEFAULT true,
  status varchar(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN
    ('DRAFT','SUBMITTED','CRM_APPROVED','VERIFIED_LOCKED','RETURNED','REOPENED')),
  rows_snapshot jsonb NOT NULL,
  created_by uuid NOT NULL,
  approved_by uuid,
  verified_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(rows_snapshot) = 'array')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_contractor_payroll_current ON contractor_payroll_versions
  (client_id, contractor_user_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), period_month)
  WHERE is_current;
CREATE UNIQUE INDEX IF NOT EXISTS uq_contractor_payroll_revision ON contractor_payroll_versions
  (client_id, contractor_user_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), period_month, version);
CREATE TABLE IF NOT EXISTS contractor_payroll_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES contractor_payroll_versions(id),
  actor_id uuid NOT NULL,
  actor_role varchar(30) NOT NULL,
  action varchar(30) NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contractor_payroll_events_version ON contractor_payroll_events(version_id, created_at);
