-- ============================================================
-- Applicability Engine — Database Migration
-- Run against your StatComPy PostgreSQL database
-- ============================================================

-- 1) ae_unit: Abstraction for Company / Branch / Site
CREATE TABLE IF NOT EXISTS ae_unit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  unit_type     VARCHAR(20) NOT NULL,  -- COMPANY | BRANCH | SITE
  name          VARCHAR(255) NOT NULL,
  state         VARCHAR(64),
  establishment_type VARCHAR(30) NOT NULL DEFAULT 'ESTABLISHMENT',  -- FACTORY | ESTABLISHMENT | BOCW_SITE
  plant_type    VARCHAR(20) NOT NULL DEFAULT 'NA',  -- HAZARDOUS | NON_HAZARDOUS | NA
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  branch_id     UUID,                  -- optional FK to client_branches
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ae_unit_tenant ON ae_unit(tenant_id);

-- 2) ae_unit_facts: JSON snapshot of headcount / metrics
CREATE TABLE IF NOT EXISTS ae_unit_facts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id       UUID NOT NULL UNIQUE,
  facts_json    JSONB NOT NULL DEFAULT '{}',
  facts_version INT NOT NULL DEFAULT 1,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID
);

-- 3) ae_act_master: Catalog of special acts (BOCW, FSSAI, PSARA, etc.)
CREATE TABLE IF NOT EXISTS ae_act_master (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(50) NOT NULL UNIQUE,
  name            VARCHAR(255) NOT NULL,
  scope           VARCHAR(20) NOT NULL,  -- COMPANY | BRANCH | SITE
  requires_profile BOOLEAN NOT NULL DEFAULT FALSE,
  has_license     BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

-- 4) ae_unit_act: Which acts are enabled per unit
CREATE TABLE IF NOT EXISTS ae_unit_act (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id     UUID NOT NULL,
  act_code    VARCHAR(50) NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  enabled_at  TIMESTAMPTZ,
  enabled_by  UUID,
  UNIQUE(unit_id, act_code)
);

-- 5) ae_unit_act_profile: Act-specific data per unit (license, workers, etc.)
CREATE TABLE IF NOT EXISTS ae_unit_act_profile (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id     UUID NOT NULL,
  act_code    VARCHAR(50) NOT NULL,
  data_json   JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID,
  UNIQUE(unit_id, act_code)
);

-- 6) ae_labour_code: The 4 labour codes
CREATE TABLE IF NOT EXISTS ae_labour_code (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code  VARCHAR(30) NOT NULL UNIQUE,
  name  VARCHAR(255) NOT NULL
);

-- 7) ae_compliance_master: All compliance items
CREATE TABLE IF NOT EXISTS ae_compliance_master (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(80) NOT NULL UNIQUE,
  name            VARCHAR(500) NOT NULL,
  labour_code     VARCHAR(30) NOT NULL,   -- WAGES / SS / IR / OSH
  group_code      VARCHAR(80),            -- OSH/BOCW, SS/PF, etc.
  periodicity     VARCHAR(20) NOT NULL,   -- MONTHLY | QUARTERLY | HALF_YEARLY | ANNUAL | EVENT | AS_REQUIRED
  evidence_schema JSONB,
  task_template   JSONB,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_ae_compl_master_lc ON ae_compliance_master(labour_code);
CREATE INDEX IF NOT EXISTS idx_ae_compl_master_gc ON ae_compliance_master(group_code);

-- 8) ae_package_master: Compliance packages
CREATE TABLE IF NOT EXISTS ae_package_master (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code  VARCHAR(80) NOT NULL UNIQUE,
  name  VARCHAR(255) NOT NULL,
  scope VARCHAR(20) NOT NULL  -- COMPANY | BRANCH | SITE
);

-- 9) ae_package_item: Package → compliance mapping
CREATE TABLE IF NOT EXISTS ae_package_item (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_code  VARCHAR(80) NOT NULL,
  compliance_id UUID NOT NULL,
  UNIQUE(package_code, compliance_id)
);

-- 10) ae_act_package_map: Act → package mapping
CREATE TABLE IF NOT EXISTS ae_act_package_map (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  act_code     VARCHAR(50) NOT NULL,
  package_code VARCHAR(80) NOT NULL,
  UNIQUE(act_code, package_code)
);

-- 11) ae_rule_master: Applicability rules
CREATE TABLE IF NOT EXISTS ae_rule_master (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 VARCHAR(255) NOT NULL,
  priority             INT NOT NULL,
  enabled              BOOLEAN NOT NULL DEFAULT TRUE,
  scope                VARCHAR(20) NOT NULL,  -- COMPANY | BRANCH | SITE
  apply_mode           VARCHAR(30) NOT NULL,  -- ATTACH_PACKAGE | ATTACH_COMPLIANCE
  target_package_code  VARCHAR(80),
  target_compliance_id UUID,
  effect_json          JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_ae_rule_priority ON ae_rule_master(priority);

-- 12) ae_rule_condition: JSON condition per rule
CREATE TABLE IF NOT EXISTS ae_rule_condition (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id        UUID NOT NULL UNIQUE,
  condition_json JSONB NOT NULL DEFAULT '{}'
);

-- 13) ae_unit_compliance: Computed applicability results
CREATE TABLE IF NOT EXISTS ae_unit_compliance (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id       UUID NOT NULL,
  compliance_id UUID NOT NULL,
  is_applicable BOOLEAN NOT NULL DEFAULT TRUE,
  source        VARCHAR(30) NOT NULL,  -- AUTO_RULE | ACT_TOGGLE | PACKAGE | MANUAL_OVERRIDE
  locked        BOOLEAN NOT NULL DEFAULT TRUE,
  explain_json  JSONB NOT NULL DEFAULT '{}',
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(unit_id, compliance_id)
);

-- 14) ae_unit_compliance_override: Admin manual overrides
CREATE TABLE IF NOT EXISTS ae_unit_compliance_override (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id              UUID NOT NULL,
  compliance_id        UUID NOT NULL,
  force_applicable     BOOLEAN,
  force_not_applicable BOOLEAN,
  locked               BOOLEAN,
  reason               TEXT,
  set_by               UUID,
  set_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(unit_id, compliance_id)
);

-- 15) ae_unit_task: Generated compliance tasks
CREATE TABLE IF NOT EXISTS ae_unit_task (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id       UUID NOT NULL,
  compliance_id UUID NOT NULL,
  period_start  DATE,              -- YYYY-MM-DD for periodic; NULL for one-off
  due_date      DATE NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'OPEN',  -- OPEN | SUBMITTED | APPROVED | RETURNED | CLOSED
  assignee_role VARCHAR(40),
  generated_by  VARCHAR(30) NOT NULL DEFAULT 'ENGINE',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(unit_id, compliance_id, period_start)
);

-- ============================================================
-- Seed: Labour Codes (4 rows)
-- ============================================================
INSERT INTO ae_labour_code (code, name) VALUES
  ('WAGES', 'Code on Wages, 2019'),
  ('SS',    'Code on Social Security, 2020'),
  ('IR',    'Industrial Relations Code, 2020'),
  ('OSH',   'Occupational Safety, Health and Working Conditions Code, 2020')
ON CONFLICT (code) DO NOTHING;
