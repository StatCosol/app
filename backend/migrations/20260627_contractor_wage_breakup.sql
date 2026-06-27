-- Wage breakup uploaded by principal employer (client/branch desk)
CREATE TABLE IF NOT EXISTS contractor_wage_breakup_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  branch_id UUID,
  uploaded_by UUID NOT NULL,
  month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year SMALLINT NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  rows_processed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), month, year)
);

-- Per-employee approved wage component breakdown
CREATE TABLE IF NOT EXISTS contractor_wage_breakup_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES contractor_wage_breakup_uploads(id) ON DELETE CASCADE,
  contractor_employee_id UUID NOT NULL,
  employee_name VARCHAR(250) NOT NULL,
  client_id UUID NOT NULL,
  month SMALLINT NOT NULL,
  year SMALLINT NOT NULL,
  basic NUMERIC(12,2) NOT NULL DEFAULT 0,
  da NUMERIC(12,2) NOT NULL DEFAULT 0,
  hra NUMERIC(12,2) NOT NULL DEFAULT 0,
  special_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_allowances NUMERIC(12,2) NOT NULL DEFAULT 0,
  monthly_gross NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, contractor_employee_id, month, year)
);
