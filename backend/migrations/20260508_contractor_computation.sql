-- Contractor computation is intentionally separate from the Payroll module.
-- CRM uploads contractor quotation wages here; contractor MCD computation rows
-- are matched against those quotation wages skill-category-wise.

CREATE TABLE IF NOT EXISTS contractor_quotation_wages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  branch_id uuid NULL REFERENCES client_branches(id) ON DELETE CASCADE,
  contractor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_category varchar(20) NOT NULL,
  daily_wage numeric(12,2) NOT NULL,
  monthly_wage numeric(12,2) NULL,
  effective_from date NOT NULL,
  effective_to date NULL,
  source varchar(255) NULL,
  notes text NULL,
  created_by_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_contractor_quotation_wages_key
ON contractor_quotation_wages (
  client_id,
  contractor_user_id,
  COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
  skill_category,
  effective_from
);

CREATE INDEX IF NOT EXISTS idx_cqw_client_contractor
ON contractor_quotation_wages(client_id, contractor_user_id);

CREATE INDEX IF NOT EXISTS idx_cqw_skill_effective
ON contractor_quotation_wages(skill_category, effective_from);

CREATE TABLE IF NOT EXISTS contractor_mcd_computations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NULL,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  branch_id uuid NULL REFERENCES client_branches(id) ON DELETE SET NULL,
  contractor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_month varchar(7) NOT NULL,
  row_number int NOT NULL,
  employee_code varchar(80) NULL,
  employee_name varchar(255) NOT NULL,
  skill_category varchar(20) NOT NULL,
  days_worked numeric(8,2) NOT NULL,
  quotation_daily_wage numeric(12,2) NULL,
  mcd_daily_wage numeric(12,2) NULL,
  basic_wage numeric(12,2) NOT NULL,
  other_earnings numeric(12,2) NOT NULL,
  gross_wage numeric(12,2) NOT NULL,
  pf_deduction numeric(12,2) NOT NULL,
  esi_deduction numeric(12,2) NOT NULL,
  pt_deduction numeric(12,2) NOT NULL,
  net_salary numeric(12,2) NOT NULL,
  match_status varchar(30) NOT NULL,
  mismatch_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cmcd_client_contractor
ON contractor_mcd_computations(client_id, contractor_user_id);

CREATE INDEX IF NOT EXISTS idx_cmcd_upload
ON contractor_mcd_computations(upload_id);

CREATE INDEX IF NOT EXISTS idx_cmcd_period_status
ON contractor_mcd_computations(period_month, match_status);
