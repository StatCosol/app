CREATE TABLE IF NOT EXISTS register_preparation_scopes (
  register_id uuid PRIMARY KEY REFERENCES registers_records(id) ON DELETE RESTRICT,
  contractor_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS register_reuse_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_register_id uuid NOT NULL REFERENCES registers_records(id) ON DELETE RESTRICT,
  target_form_id varchar(200) NOT NULL,
  client_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  period_year integer NOT NULL,
  period_month integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  basis varchar(200) NOT NULL,
  attestation text NOT NULL CHECK (length(trim(attestation)) BETWEEN 10 AND 2000),
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid NULL,
  approved_at timestamptz NULL,
  applicability_snapshot jsonb NOT NULL,
  UNIQUE(source_register_id,target_form_id),
  CHECK ((approved_by IS NULL) = (approved_at IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_register_reuse_branch_period ON register_reuse_links(branch_id,period_year,period_month);
CREATE TABLE IF NOT EXISTS register_operational_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  form_id varchar(200) NOT NULL,
  period_year integer NOT NULL,
  period_month integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  source_reference varchar(300) NOT NULL CHECK (length(trim(source_reference))>0),
  revision integer NOT NULL CHECK(revision>0),
  is_current boolean NOT NULL DEFAULT true,
  input_snapshot jsonb NOT NULL CHECK(jsonb_typeof(input_snapshot)='object'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid NULL,
  approved_at timestamptz NULL,
  CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
  UNIQUE(branch_id,form_id,period_year,period_month,source_reference,revision)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_register_operational_current ON register_operational_sources(branch_id,form_id,period_year,period_month,source_reference) WHERE is_current;
