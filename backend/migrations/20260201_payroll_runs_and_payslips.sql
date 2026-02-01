-- Payroll run + employee + items + payslip archive tables
-- Run this after your base schema. Safe to run multiple times.

CREATE TABLE IF NOT EXISTS payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  branch_id uuid NULL,
  period_year int NOT NULL,
  period_month int NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'DRAFT',
  source_payroll_input_id uuid NULL,
  title varchar(200) NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_client_period ON payroll_runs(client_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_source_input ON payroll_runs(source_payroll_input_id);

-- One row per employee in a run (no hard FK to employee table to keep schema flexible)
CREATE TABLE IF NOT EXISTS payroll_run_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  client_id uuid NOT NULL,
  branch_id uuid NULL,
  employee_code varchar(50) NOT NULL,
  employee_name varchar(200) NOT NULL,
  designation varchar(120) NULL,
  uan varchar(30) NULL,
  esic varchar(30) NULL,
  gross_earnings numeric(14,2) NOT NULL DEFAULT 0,
  total_deductions numeric(14,2) NOT NULL DEFAULT 0,
  employer_cost numeric(14,2) NOT NULL DEFAULT 0,
  net_pay numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_run_emp UNIQUE(run_id, employee_code)
);

CREATE INDEX IF NOT EXISTS idx_payroll_run_employees_run ON payroll_run_employees(run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_run_employees_client ON payroll_run_employees(client_id);

-- Component-wise computed amounts per employee
CREATE TABLE IF NOT EXISTS payroll_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  run_employee_id uuid NOT NULL,
  component_code varchar(60) NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  units numeric(14,2) NULL,
  rate numeric(14,4) NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_run_emp_comp UNIQUE(run_employee_id, component_code)
);

CREATE INDEX IF NOT EXISTS idx_payroll_run_items_run ON payroll_run_items(run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_run_items_run_emp ON payroll_run_items(run_employee_id);

-- Payslip PDFs archived per employee per run
CREATE TABLE IF NOT EXISTS payroll_payslip_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  client_id uuid NOT NULL,
  branch_id uuid NULL,
  employee_code varchar(50) NOT NULL,
  period_year int NOT NULL,
  period_month int NOT NULL,
  file_name varchar(255) NOT NULL,
  file_type varchar(100) NOT NULL DEFAULT 'application/pdf',
  file_size bigint NOT NULL,
  file_path text NOT NULL,
  generated_by_user_id uuid NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_payslip_archive UNIQUE(run_id, employee_code)
);

CREATE INDEX IF NOT EXISTS idx_payslip_arch_run ON payroll_payslip_archives(run_id);
CREATE INDEX IF NOT EXISTS idx_payslip_arch_client_period ON payroll_payslip_archives(client_id, period_year, period_month);
