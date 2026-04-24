-- ============================================================================
-- MULTI-CLIENT PAYROLL STRUCTURE ENGINE — Schema
-- ============================================================================
-- Creates 4 tables:
--   1. payroll_client_structures   – per-client salary structures with versioning
--   2. payroll_structure_components – components per structure with calc method/formula
--   3. payroll_component_conditions – optional conditions on components
--   4. payroll_statutory_configs    – per-structure, per-state statutory configuration
-- ============================================================================

-- ── 1. Client structures ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_client_structures (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid        NOT NULL,
  name            varchar(120) NOT NULL,
  code            varchar(60)  NOT NULL,
  version         int          NOT NULL DEFAULT 1,
  effective_from  date         NOT NULL,
  effective_to    date,
  is_active       boolean      NOT NULL DEFAULT true,
  is_default      boolean      NOT NULL DEFAULT false,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_structures_code_version
  ON payroll_client_structures (client_id, code, version);

CREATE INDEX IF NOT EXISTS idx_client_structures_client
  ON payroll_client_structures (client_id);

-- ── 2. Structure components ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_structure_components (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id         uuid         NOT NULL REFERENCES payroll_client_structures(id) ON DELETE CASCADE,
  code                 varchar(80)  NOT NULL,
  name                 varchar(120) NOT NULL,
  label                varchar(120) NOT NULL,
  component_type       varchar(30)  NOT NULL,  -- EARNING | DEDUCTION | EMPLOYER_CONTRIBUTION
  calculation_method   varchar(30)  NOT NULL,  -- FIXED | PERCENTAGE | FORMULA | BALANCING | CONDITIONAL_FIXED
  display_order        int          NOT NULL DEFAULT 1,
  fixed_value          numeric(12,4),
  percentage_value     numeric(12,4),
  based_on             varchar(80),
  formula              text,
  round_rule           varchar(20)  NOT NULL DEFAULT 'NONE',
  taxable              boolean      NOT NULL DEFAULT true,
  statutory            boolean      NOT NULL DEFAULT false,
  is_visible_in_payslip boolean    NOT NULL DEFAULT true,
  is_active            boolean      NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_structure_components_code
  ON payroll_structure_components (structure_id, code);

CREATE INDEX IF NOT EXISTS idx_structure_components_structure
  ON payroll_structure_components (structure_id);

-- ── 3. Component conditions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_component_conditions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id   uuid         NOT NULL REFERENCES payroll_structure_components(id) ON DELETE CASCADE,
  field_name     varchar(80)  NOT NULL,
  operator       varchar(10)  NOT NULL,  -- EQ | NE | GT | GTE | LT | LTE
  field_value    varchar(100) NOT NULL,
  action_type    varchar(30)  NOT NULL,  -- SET_FIXED | APPLY_PERCENT | ENABLE | DISABLE | WARNING
  action_value   varchar(200),
  message        varchar(255)
);

CREATE INDEX IF NOT EXISTS idx_component_conditions_component
  ON payroll_component_conditions (component_id);

-- ── 4. Statutory configs ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_statutory_configs (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id                uuid         NOT NULL REFERENCES payroll_client_structures(id) ON DELETE CASCADE,
  state_code                  varchar(10)  NOT NULL,
  minimum_wage                numeric(12,2),
  warn_if_gross_below_min_wage boolean     NOT NULL DEFAULT true,
  enable_pt                   boolean      NOT NULL DEFAULT true,
  enable_pf                   boolean      NOT NULL DEFAULT true,
  enable_esi                  boolean      NOT NULL DEFAULT true,
  pf_employee_rate            numeric(8,4) NOT NULL DEFAULT 12,
  pf_wage_cap                 numeric(12,2) NOT NULL DEFAULT 15000,
  pf_apply_if_gross_above     numeric(12,2),
  esi_employee_rate           numeric(8,4) NOT NULL DEFAULT 0.75,
  esi_employer_rate           numeric(8,4) NOT NULL DEFAULT 3.25,
  esi_gross_ceiling           numeric(12,2) NOT NULL DEFAULT 21000,
  carry_forward_leave         boolean      NOT NULL DEFAULT true,
  monthly_paid_leave_accrual  numeric(6,2) NOT NULL DEFAULT 1.5,
  attendance_bonus_amount     numeric(12,2),
  attendance_bonus_if_lop_lte numeric(6,2)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_statutory_configs_structure_state
  ON payroll_statutory_configs (structure_id, state_code);

CREATE INDEX IF NOT EXISTS idx_statutory_configs_structure
  ON payroll_statutory_configs (structure_id);
