-- ============================================================
-- Payroll + Statutory Engine: Employee Master, Nomination,
-- Client-Specific Payroll Setup, Register Templates
-- 2026-02-17
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Employee Master
-- ============================================================
CREATE TABLE IF NOT EXISTS employees (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL,
  branch_id     UUID,
  employee_code VARCHAR(50) NOT NULL,
  first_name    VARCHAR(120) NOT NULL,
  last_name     VARCHAR(120),
  date_of_birth DATE,
  gender        VARCHAR(10),
  father_name   VARCHAR(200),
  phone         VARCHAR(20),
  email         VARCHAR(200),
  aadhaar       VARCHAR(20),
  pan           VARCHAR(20),
  uan           VARCHAR(30),
  esic          VARCHAR(30),
  bank_name     VARCHAR(200),
  bank_account  VARCHAR(40),
  ifsc          VARCHAR(20),
  designation   VARCHAR(120),
  department    VARCHAR(120),
  date_of_joining DATE,
  date_of_exit  DATE,
  state_code    VARCHAR(10),
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, employee_code)
);

CREATE INDEX IF NOT EXISTS idx_employees_client ON employees(client_id);
CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_employees_code   ON employees(employee_code);
CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(client_id, is_active);

-- ============================================================
-- 2. Employee Sequence (for auto-generated employee codes)
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_sequence (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL,
  state_code  VARCHAR(10) NOT NULL,
  branch_code VARCHAR(10) NOT NULL,
  year        INT NOT NULL,
  last_seq    INT NOT NULL DEFAULT 0,
  UNIQUE(client_id, state_code, branch_code, year)
);

-- ============================================================
-- 3. Employee Nomination
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_nominations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES employees(id),
  nomination_type VARCHAR(30) NOT NULL,  -- PF, ESI, GRATUITY, INSURANCE, SALARY
  declaration_date DATE,
  witness_name  VARCHAR(200),
  witness_address TEXT,
  status        VARCHAR(30) DEFAULT 'DRAFT',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_nom_employee ON employee_nominations(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_nom_type ON employee_nominations(nomination_type);

-- ============================================================
-- 4. Nomination Members
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_nomination_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomination_id   UUID NOT NULL REFERENCES employee_nominations(id) ON DELETE CASCADE,
  member_name     VARCHAR(200) NOT NULL,
  relationship    VARCHAR(60),
  date_of_birth   DATE,
  share_pct       NUMERIC(5,2) DEFAULT 0,
  address         TEXT,
  is_minor        BOOLEAN DEFAULT FALSE,
  guardian_name   VARCHAR(200),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nom_member_nom ON employee_nomination_members(nomination_id);

-- ============================================================
-- 5. Employee Generated Forms (PDF output)
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_generated_forms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES employees(id),
  form_type     VARCHAR(30) NOT NULL,     -- PF_FORM2, ESI_FORM1, etc.
  file_name     VARCHAR(255) NOT NULL,
  file_path     TEXT NOT NULL,
  file_size     BIGINT DEFAULT 0,
  generated_by  UUID,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gen_form_employee ON employee_generated_forms(employee_id);

-- ============================================================
-- 6. Register Templates (state-wise)
-- ============================================================
CREATE TABLE IF NOT EXISTS register_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code          VARCHAR(10) NOT NULL,
  establishment_type  VARCHAR(30) NOT NULL DEFAULT 'FACTORY',
  register_type       VARCHAR(60) NOT NULL,   -- FORM_A, FORM_B, REGISTER_WAGES, etc.
  title               VARCHAR(200) NOT NULL,
  description         TEXT,
  template_file_path  TEXT,
  column_definitions  JSONB DEFAULT '[]'::jsonb,
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(state_code, establishment_type, register_type)
);

CREATE INDEX IF NOT EXISTS idx_reg_tpl_state ON register_templates(state_code);

-- ============================================================
-- 7. Client-Specific Payroll Setup
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll_client_setup (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL UNIQUE,
  pf_enabled  BOOLEAN DEFAULT TRUE,
  esi_enabled BOOLEAN DEFAULT TRUE,
  pt_enabled  BOOLEAN DEFAULT FALSE,
  lwf_enabled BOOLEAN DEFAULT FALSE,
  pf_employer_rate  NUMERIC(5,2) DEFAULT 12.00,
  pf_employee_rate  NUMERIC(5,2) DEFAULT 12.00,
  esi_employer_rate NUMERIC(5,2) DEFAULT 3.25,
  esi_employee_rate NUMERIC(5,2) DEFAULT 0.75,
  pf_wage_ceiling   NUMERIC(14,2) DEFAULT 15000,
  esi_wage_ceiling   NUMERIC(14,2) DEFAULT 21000,
  pay_cycle     VARCHAR(20) DEFAULT 'MONTHLY',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. Client-Specific Payroll Components
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll_components (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL,
  code            VARCHAR(60) NOT NULL,
  name            VARCHAR(200) NOT NULL,
  component_type  VARCHAR(30) NOT NULL,  -- EARNING, DEDUCTION, EMPLOYER, INFO
  is_taxable      BOOLEAN DEFAULT FALSE,
  affects_pf_wage BOOLEAN DEFAULT FALSE,
  affects_esi_wage BOOLEAN DEFAULT FALSE,
  is_required     BOOLEAN DEFAULT FALSE,
  display_order   INT DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, code)
);

CREATE INDEX IF NOT EXISTS idx_pc_client ON payroll_components(client_id);

-- ============================================================
-- 9. Component Rules (formula / slab reference)
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll_component_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id    UUID NOT NULL REFERENCES payroll_components(id) ON DELETE CASCADE,
  rule_type       VARCHAR(30) NOT NULL,  -- FIXED, PERCENTAGE, SLAB, FORMULA
  base_component  VARCHAR(60),           -- code of source component (for %)
  percentage      NUMERIC(8,4),
  fixed_amount    NUMERIC(14,2),
  formula         TEXT,
  priority        INT DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pcr_component ON payroll_component_rules(component_id);

-- ============================================================
-- 10. Component Slabs
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll_component_slabs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id         UUID NOT NULL REFERENCES payroll_component_rules(id) ON DELETE CASCADE,
  from_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  to_amount       NUMERIC(14,2),
  slab_pct        NUMERIC(8,4),
  slab_fixed      NUMERIC(14,2),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pcs_rule ON payroll_component_slabs(rule_id);

-- ============================================================
-- 11. Payroll Run Component Values (per-employee per-component)
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll_run_component_values (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            UUID NOT NULL,
  run_employee_id   UUID NOT NULL,
  component_code    VARCHAR(60) NOT NULL,
  amount            NUMERIC(14,2) DEFAULT 0,
  source            VARCHAR(20) NOT NULL DEFAULT 'UPLOADED',  -- UPLOADED, CALCULATED, OVERRIDE
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(run_employee_id, component_code)
);

CREATE INDEX IF NOT EXISTS idx_prcv_run ON payroll_run_component_values(run_id);
CREATE INDEX IF NOT EXISTS idx_prcv_employee ON payroll_run_component_values(run_employee_id);

-- ============================================================
-- 12. ALTER existing tables
-- ============================================================

-- payroll_run_employees: add employee_id FK and state_code
ALTER TABLE payroll_run_employees
  ADD COLUMN IF NOT EXISTS employee_id UUID,
  ADD COLUMN IF NOT EXISTS state_code  VARCHAR(10);

CREATE INDEX IF NOT EXISTS idx_pre_employee_id ON payroll_run_employees(employee_id);

-- payroll_run_items: add source enum
ALTER TABLE payroll_run_items
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'UPLOADED';

-- registers_records: add register_type, state_code, approval fields
ALTER TABLE registers_records
  ADD COLUMN IF NOT EXISTS register_type       VARCHAR(60),
  ADD COLUMN IF NOT EXISTS state_code          VARCHAR(10),
  ADD COLUMN IF NOT EXISTS approval_status     VARCHAR(20) DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS approved_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS approved_at         TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_rr_approval ON registers_records(approval_status);
CREATE INDEX IF NOT EXISTS idx_rr_state ON registers_records(state_code);

COMMIT;
