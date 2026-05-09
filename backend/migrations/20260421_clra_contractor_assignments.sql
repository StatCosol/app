-- ============================================================
-- CLRA Contractor Assignment-wise Register Module
-- Migration: 20260421_clra_contractor_assignments
-- ============================================================

-- 1. PE Establishment master (one row per registered location)
CREATE TABLE IF NOT EXISTS clra_pe_establishments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  branch_id UUID,
  pe_name VARCHAR(255) NOT NULL,
  establishment_name VARCHAR(255) NOT NULL,
  establishment_code VARCHAR(100),
  registration_certificate_no VARCHAR(150),
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(120),
  district VARCHAR(120),
  state_code VARCHAR(10) NOT NULL,
  pincode VARCHAR(20),
  unit_type VARCHAR(50) NOT NULL DEFAULT 'FACTORY',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clra_pe_client ON clra_pe_establishments(client_id);
CREATE INDEX IF NOT EXISTS idx_clra_pe_branch ON clra_pe_establishments(branch_id);

-- 2. Contractor master (standalone, separate from user-based contractor)
CREATE TABLE IF NOT EXISTS clra_contractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_code VARCHAR(100) NOT NULL UNIQUE,
  legal_name VARCHAR(255) NOT NULL,
  trade_name VARCHAR(255),
  contact_person VARCHAR(255),
  mobile VARCHAR(30),
  email VARCHAR(255),
  pan VARCHAR(30),
  gstin VARCHAR(30),
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(120),
  district VARCHAR(120),
  state_code VARCHAR(10),
  pincode VARCHAR(20),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Contractor assignments (key deployment object: contractor + PE + contract)
CREATE TABLE IF NOT EXISTS clra_contractor_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES clra_contractors(id) ON DELETE RESTRICT,
  pe_establishment_id UUID NOT NULL REFERENCES clra_pe_establishments(id) ON DELETE RESTRICT,
  assignment_code VARCHAR(120) NOT NULL UNIQUE,
  contract_no VARCHAR(150),
  work_order_no VARCHAR(150),
  nature_of_work VARCHAR(255) NOT NULL,
  work_location_name VARCHAR(255),
  work_location_address TEXT,
  state_code VARCHAR(10) NOT NULL,
  licence_no VARCHAR(150),
  licence_valid_from DATE,
  licence_valid_to DATE,
  maximum_workmen INTEGER,
  wage_period_type VARCHAR(30) NOT NULL DEFAULT 'MONTHLY',
  start_date DATE NOT NULL,
  end_date DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clra_ca_contractor ON clra_contractor_assignments(contractor_id);
CREATE INDEX IF NOT EXISTS idx_clra_ca_pe ON clra_contractor_assignments(pe_establishment_id);
CREATE INDEX IF NOT EXISTS idx_clra_ca_status ON clra_contractor_assignments(status);

-- 4. Contractor workers (employee master per contractor)
CREATE TABLE IF NOT EXISTS clra_contractor_workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES clra_contractors(id) ON DELETE RESTRICT,
  worker_code VARCHAR(100) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  father_or_spouse_name VARCHAR(255),
  gender VARCHAR(20),
  date_of_birth DATE,
  category VARCHAR(50),
  designation VARCHAR(120),
  aadhaar_masked VARCHAR(50),
  uan VARCHAR(50),
  esi_no VARCHAR(50),
  bank_account_masked VARCHAR(50),
  mobile VARCHAR(30),
  address TEXT,
  date_of_joining DATE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contractor_id, worker_code)
);
CREATE INDEX IF NOT EXISTS idx_clra_cw_contractor ON clra_contractor_workers(contractor_id);

-- 5. Worker deployments (worker assigned to specific assignment/PE/location)
CREATE TABLE IF NOT EXISTS clra_worker_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES clra_contractor_assignments(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES clra_contractor_workers(id) ON DELETE RESTRICT,
  deployment_start DATE NOT NULL,
  deployment_end DATE,
  rate_per_day NUMERIC(12,2),
  rate_per_month NUMERIC(12,2),
  ot_rate_per_hour NUMERIC(12,2),
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assignment_id, worker_id, deployment_start)
);
CREATE INDEX IF NOT EXISTS idx_clra_wd_assignment ON clra_worker_deployments(assignment_id);
CREATE INDEX IF NOT EXISTS idx_clra_wd_worker ON clra_worker_deployments(worker_id);

-- 6. Wage periods (one per assignment per month)
CREATE TABLE IF NOT EXISTS clra_wage_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES clra_contractor_assignments(id) ON DELETE CASCADE,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  wage_month INTEGER NOT NULL,
  wage_year INTEGER NOT NULL,
  payment_date DATE,
  payment_place VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assignment_id, period_from, period_to)
);
CREATE INDEX IF NOT EXISTS idx_clra_wp_assignment ON clra_wage_periods(assignment_id);
CREATE INDEX IF NOT EXISTS idx_clra_wp_month ON clra_wage_periods(wage_year, wage_month);

-- 7. Daily attendance (source for Form XVI muster)
CREATE TABLE IF NOT EXISTS clra_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wage_period_id UUID NOT NULL REFERENCES clra_wage_periods(id) ON DELETE CASCADE,
  worker_deployment_id UUID NOT NULL REFERENCES clra_worker_deployments(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'P',
  in_time TIME,
  out_time TIME,
  normal_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  ot_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (worker_deployment_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS idx_clra_att_period ON clra_attendance(wage_period_id);
CREATE INDEX IF NOT EXISTS idx_clra_att_worker ON clra_attendance(worker_deployment_id);

-- 8. Wage records (Form XVII / XVIII / XIX source)
CREATE TABLE IF NOT EXISTS clra_wages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wage_period_id UUID NOT NULL REFERENCES clra_wage_periods(id) ON DELETE CASCADE,
  worker_deployment_id UUID NOT NULL REFERENCES clra_worker_deployments(id) ON DELETE CASCADE,
  days_worked NUMERIC(6,2) NOT NULL DEFAULT 0,
  units_worked NUMERIC(10,2),
  basic_wage NUMERIC(12,2) NOT NULL DEFAULT 0,
  da NUMERIC(12,2) NOT NULL DEFAULT 0,
  hra NUMERIC(12,2) NOT NULL DEFAULT 0,
  ot_wages NUMERIC(12,2) NOT NULL DEFAULT 0,
  allowances NUMERIC(12,2) NOT NULL DEFAULT 0,
  gross_wages NUMERIC(12,2) NOT NULL DEFAULT 0,
  pf_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
  esi_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
  pt_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_wages NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (wage_period_id, worker_deployment_id)
);
CREATE INDEX IF NOT EXISTS idx_clra_wages_period ON clra_wages(wage_period_id);

-- 9. Register run tracking (generated CLRA registers)
CREATE TABLE IF NOT EXISTS clra_register_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES clra_contractor_assignments(id) ON DELETE CASCADE,
  wage_period_id UUID REFERENCES clra_wage_periods(id) ON DELETE SET NULL,
  register_code VARCHAR(30) NOT NULL,
  file_name VARCHAR(255),
  file_url TEXT,
  generated_by_user_id UUID,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version_no INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'GENERATED'
);
CREATE INDEX IF NOT EXISTS idx_clra_runs_assignment ON clra_register_runs(assignment_id);
CREATE INDEX IF NOT EXISTS idx_clra_runs_period ON clra_register_runs(wage_period_id);
