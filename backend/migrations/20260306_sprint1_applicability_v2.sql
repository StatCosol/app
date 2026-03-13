-- =============================================================
-- Sprint 1: Applicability Engine V2 — Production Schema
-- New tables: unit_facts, unit_compliance_master, threshold_master,
--   applicability_rule, compliance_package, package_compliance,
--   package_rule, unit_applicable_compliance,
--   unit_applicability_audit, branch_safety_upload
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Threshold Master
CREATE TABLE IF NOT EXISTS threshold_master (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code              text NOT NULL,
  description       text,
  value_number      numeric,
  value_text        text,
  is_active         boolean NOT NULL DEFAULT true,
  state_code        text,          -- null = global
  effective_from    date NOT NULL,
  effective_to      date
);
CREATE INDEX IF NOT EXISTS idx_threshold_code_state ON threshold_master (code, state_code, effective_from);

-- 2) Unit Compliance Master (the engine's own compliance catalog)
-- Named differently from the existing compliance_master to avoid conflict
CREATE TABLE IF NOT EXISTS unit_compliance_master (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code              text NOT NULL,
  name              text NOT NULL,
  category          text NOT NULL DEFAULT 'LABOUR_CODE',
  state_code        text,          -- null = central
  frequency         text NOT NULL DEFAULT 'MONTHLY',
  applies_to        text NOT NULL DEFAULT 'BOTH',
  is_active         boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_unit_compliance_master_code ON unit_compliance_master (code);

-- 3) Compliance Package
CREATE TABLE IF NOT EXISTS compliance_package (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code              text NOT NULL,
  name              text NOT NULL,
  state_code        text,
  applies_to        text,
  is_active         boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_compliance_package_code ON compliance_package (code);

-- 4) Package Compliance (link compliance masters to packages)
CREATE TABLE IF NOT EXISTS package_compliance (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id          uuid NOT NULL REFERENCES compliance_package(id) ON DELETE CASCADE,
  compliance_id       uuid NOT NULL REFERENCES unit_compliance_master(id) ON DELETE CASCADE,
  included_by_default boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pkg_compl ON package_compliance (package_id, compliance_id);

-- 5) Applicability Rule
CREATE TABLE IF NOT EXISTS applicability_rule (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  state_code              text,          -- null = global
  priority                int NOT NULL DEFAULT 100,
  target_compliance_id    uuid NOT NULL REFERENCES unit_compliance_master(id) ON DELETE CASCADE,
  effect                  text NOT NULL DEFAULT 'ENABLE',  -- ENABLE | DISABLE
  conditions_json         jsonb NOT NULL DEFAULT '{}',
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rule_state_prio ON applicability_rule (state_code, priority);

-- 6) Package Rule (link rules to packages)
CREATE TABLE IF NOT EXISTS package_rule (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id        uuid NOT NULL REFERENCES compliance_package(id) ON DELETE CASCADE,
  rule_id           uuid NOT NULL REFERENCES applicability_rule(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pkg_rule ON package_rule (package_id, rule_id);

-- 7) Unit Facts
CREATE TABLE IF NOT EXISTS unit_facts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id               uuid NOT NULL,
  state_code              text NOT NULL,
  establishment_type      text NOT NULL DEFAULT 'ESTABLISHMENT',
  is_hazardous            boolean NOT NULL DEFAULT false,
  industry_category       text,
  employee_total          int NOT NULL DEFAULT 0,
  employee_male           int NOT NULL DEFAULT 0,
  employee_female         int NOT NULL DEFAULT 0,
  contract_workers_total  int NOT NULL DEFAULT 0,
  contractors_count       int NOT NULL DEFAULT 0,
  is_bocw_project         boolean NOT NULL DEFAULT false,
  has_canteen             boolean,
  has_creche              boolean,
  updated_by              uuid,
  updated_at              timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_unit_facts_branch ON unit_facts (branch_id);

-- 8) Unit Applicable Compliance (computed results + overrides)
CREATE TABLE IF NOT EXISTS unit_applicable_compliance (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id         uuid NOT NULL,
  compliance_id     uuid NOT NULL REFERENCES unit_compliance_master(id) ON DELETE CASCADE,
  is_applicable     boolean NOT NULL DEFAULT false,
  source            text NOT NULL DEFAULT 'AUTO',    -- AUTO | SPECIAL_SELECTED | OVERRIDE
  override_reason   text,
  computed_by       uuid,
  computed_at       timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_unit_appl_compl ON unit_applicable_compliance (branch_id, compliance_id);

-- 9) Unit Applicability Audit Trail
CREATE TABLE IF NOT EXISTS unit_applicability_audit (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id         uuid NOT NULL,
  actor_user_id     uuid,
  action            text NOT NULL,  -- FACTS_UPDATED | RECOMPUTED | OVERRIDE_APPLIED | SPECIAL_ACT_SELECTED
  before_json       jsonb,
  after_json        jsonb,
  remarks           text,
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_branch ON unit_applicability_audit (branch_id, created_at DESC);

-- 10) Branch Safety Upload
CREATE TABLE IF NOT EXISTS branch_safety_upload (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id         uuid NOT NULL,
  doc_master_id     int NOT NULL REFERENCES safety_document_master(id) ON DELETE CASCADE,
  period_month      date NOT NULL,       -- store as YYYY-MM-01
  file_url          text NOT NULL,
  uploaded_by       uuid,
  uploaded_at       timestamptz DEFAULT now(),
  status            text NOT NULL DEFAULT 'UPLOADED',  -- UPLOADED | REJECTED | EXPIRED
  remarks           text
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_branch_safety_upload ON branch_safety_upload (branch_id, doc_master_id, period_month);

-- 11) Add missing columns to safety_document_master for engine integration
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='safety_document_master' AND column_name='code') THEN
    ALTER TABLE safety_document_master ADD COLUMN code text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='safety_document_master' AND column_name='is_hazardous_only') THEN
    ALTER TABLE safety_document_master ADD COLUMN is_hazardous_only boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='safety_document_master' AND column_name='min_headcount') THEN
    ALTER TABLE safety_document_master ADD COLUMN min_headcount int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='safety_document_master' AND column_name='max_headcount') THEN
    ALTER TABLE safety_document_master ADD COLUMN max_headcount int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='safety_document_master' AND column_name='special_act_code') THEN
    ALTER TABLE safety_document_master ADD COLUMN special_act_code text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='safety_document_master' AND column_name='conditions_json') THEN
    ALTER TABLE safety_document_master ADD COLUMN conditions_json jsonb;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sdm_code ON safety_document_master (code) WHERE code IS NOT NULL;
