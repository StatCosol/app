-- Migration: Create missing tables for HR master data, attendance, employee documents,
--            salary revisions, and payroll approval workflow columns
-- Date: 2026-03-06
-- Tables created: departments, grades, designations, attendance_records,
--                 employee_documents, employee_salary_revisions
-- Altered: employees (add FK columns), payroll_runs (add approval columns)

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- 1. DEPARTMENTS MASTER
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS departments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL,
  code          VARCHAR(50)  NOT NULL,
  name          VARCHAR(200) NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, code)
);
CREATE INDEX IF NOT EXISTS idx_departments_client ON departments (client_id);

-- ═══════════════════════════════════════════════════════════════
-- 2. GRADES MASTER
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS grades (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL,
  code          VARCHAR(50)  NOT NULL,
  name          VARCHAR(200) NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, code)
);
CREATE INDEX IF NOT EXISTS idx_grades_client ON grades (client_id);

-- ═══════════════════════════════════════════════════════════════
-- 3. DESIGNATIONS MASTER
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS designations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL,
  code          VARCHAR(50)  NOT NULL,
  name          VARCHAR(200) NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, code)
);
CREATE INDEX IF NOT EXISTS idx_designations_client ON designations (client_id);

-- ═══════════════════════════════════════════════════════════════
-- 4. EMPLOYEES — add FK columns for department, grade, designation
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS department_id  UUID,
  ADD COLUMN IF NOT EXISTS grade_id       UUID,
  ADD COLUMN IF NOT EXISTS designation_id UUID;

CREATE INDEX IF NOT EXISTS idx_emp_department ON employees (department_id);
CREATE INDEX IF NOT EXISTS idx_emp_grade      ON employees (grade_id);
CREATE INDEX IF NOT EXISTS idx_emp_designation ON employees (designation_id);

-- Foreign key constraints (non-enforced — graceful handling in application)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_emp_department') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_emp_department
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_emp_grade') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_emp_grade
      FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_emp_designation') THEN
    ALTER TABLE employees ADD CONSTRAINT fk_emp_designation
      FOREIGN KEY (designation_id) REFERENCES designations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 5. ATTENDANCE RECORDS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS attendance_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID NOT NULL,
  branch_id             UUID,
  employee_id           UUID NOT NULL,
  employee_code         VARCHAR(50) NOT NULL,
  date                  DATE NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'PRESENT',
  check_in              TIME,
  check_out             TIME,
  worked_hours          NUMERIC(5,2),
  overtime_hours        NUMERIC(5,2) NOT NULL DEFAULT 0,
  remarks               TEXT,
  source                VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
  leave_application_id  UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date)
);
CREATE INDEX IF NOT EXISTS idx_att_client    ON attendance_records (client_id);
CREATE INDEX IF NOT EXISTS idx_att_branch    ON attendance_records (branch_id);
CREATE INDEX IF NOT EXISTS idx_att_employee  ON attendance_records (employee_id);
CREATE INDEX IF NOT EXISTS idx_att_date      ON attendance_records (date);

-- ═══════════════════════════════════════════════════════════════
-- 6. EMPLOYEE DOCUMENTS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS employee_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL,
  employee_id         UUID NOT NULL,
  doc_type            VARCHAR(80)  NOT NULL,
  doc_name            VARCHAR(255) NOT NULL,
  file_name           VARCHAR(500) NOT NULL,
  file_path           VARCHAR(1000) NOT NULL,
  file_size           INT NOT NULL DEFAULT 0,
  mime_type           VARCHAR(100),
  uploaded_by_user_id UUID NOT NULL,
  expiry_date         DATE,
  is_verified         BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by_user_id UUID,
  verified_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_empdoc_client   ON employee_documents (client_id);
CREATE INDEX IF NOT EXISTS idx_empdoc_employee ON employee_documents (employee_id);
CREATE INDEX IF NOT EXISTS idx_empdoc_composite ON employee_documents (client_id, employee_id);

-- ═══════════════════════════════════════════════════════════════
-- 7. EMPLOYEE SALARY REVISIONS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS employee_salary_revisions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL,
  employee_id         UUID NOT NULL,
  effective_date      DATE NOT NULL,
  previous_ctc        NUMERIC(14,2) NOT NULL,
  new_ctc             NUMERIC(14,2) NOT NULL,
  increment_pct       NUMERIC(6,2),
  reason              TEXT,
  approved_by_user_id UUID,
  revision_letter_path VARCHAR(500),
  component_snapshot  JSONB,
  created_by_user_id  UUID NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_salrev_client   ON employee_salary_revisions (client_id);
CREATE INDEX IF NOT EXISTS idx_salrev_employee ON employee_salary_revisions (employee_id);
CREATE INDEX IF NOT EXISTS idx_salrev_composite ON employee_salary_revisions (client_id, employee_id, effective_date);

-- ═══════════════════════════════════════════════════════════════
-- 8. PAYROLL RUNS — add approval workflow columns
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS submitted_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS submitted_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by_user_id  UUID,
  ADD COLUMN IF NOT EXISTS approved_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_comments    TEXT,
  ADD COLUMN IF NOT EXISTS rejected_by_user_id  UUID,
  ADD COLUMN IF NOT EXISTS rejected_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason     TEXT;

-- ═══════════════════════════════════════════════════════════════
-- 9. PAYROLL ENGINE TABLES (if not already created by earlier migration)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pay_rule_sets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL,
  branch_id      UUID,
  name           VARCHAR(200) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to   DATE,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prs_client ON pay_rule_sets (client_id, branch_id, effective_from);

CREATE TABLE IF NOT EXISTS pay_rule_parameters (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id  UUID NOT NULL REFERENCES pay_rule_sets(id) ON DELETE CASCADE,
  key          VARCHAR(100) NOT NULL,
  value_num    NUMERIC(14,4),
  value_text   VARCHAR(500),
  unit         VARCHAR(50),
  notes        TEXT,
  UNIQUE (rule_set_id, key)
);

CREATE TABLE IF NOT EXISTS pay_salary_structures (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL,
  name           VARCHAR(200) NOT NULL,
  scope_type     VARCHAR(30)  NOT NULL DEFAULT 'TENANT',
  branch_id      UUID,
  department_id  UUID,
  grade_id       UUID,
  employee_id    UUID,
  rule_set_id    UUID,
  effective_from DATE NOT NULL,
  effective_to   DATE,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pss_client ON pay_salary_structures (client_id, scope_type, effective_from);

CREATE TABLE IF NOT EXISTS pay_salary_structure_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id     UUID NOT NULL REFERENCES pay_salary_structures(id) ON DELETE CASCADE,
  component_id     UUID NOT NULL,
  calc_method      VARCHAR(30) NOT NULL DEFAULT 'FIXED',
  fixed_amount     NUMERIC(14,2),
  percentage       NUMERIC(8,4),
  percentage_base  VARCHAR(60),
  formula          TEXT,
  slab_ref         JSONB,
  balancing_config JSONB,
  min_amount       NUMERIC(14,2),
  max_amount       NUMERIC(14,2),
  rounding_mode    VARCHAR(30) NOT NULL DEFAULT 'NEAREST_RUPEE',
  priority         INT NOT NULL DEFAULT 100,
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (structure_id, component_id)
);

CREATE TABLE IF NOT EXISTS pay_calc_traces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      UUID NOT NULL,
  employee_id UUID NOT NULL,
  trace       JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, employee_id)
);

COMMIT;
