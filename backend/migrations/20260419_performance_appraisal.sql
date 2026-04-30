-- Migration: Performance Appraisal Module
-- Creates all tables for appraisal cycles, templates, employee evaluations, approvals

BEGIN;

-- 1. Rating scales (client-configurable)
CREATE TABLE IF NOT EXISTS appraisal_rating_scales (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID         REFERENCES clients(id) ON DELETE CASCADE,
  scale_name    VARCHAR(100) NOT NULL,
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appraisal_rating_scale_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scale_id      UUID         NOT NULL REFERENCES appraisal_rating_scales(id) ON DELETE CASCADE,
  rating_code   VARCHAR(30)  NOT NULL,
  rating_label  VARCHAR(100) NOT NULL,
  min_score     NUMERIC(5,2) NOT NULL,
  max_score     NUMERIC(5,2) NOT NULL,
  color_code    VARCHAR(20),
  sequence      INT          NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_arsi_scale ON appraisal_rating_scale_items(scale_id);

-- 2. Appraisal templates
CREATE TABLE IF NOT EXISTS appraisal_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID         REFERENCES clients(id) ON DELETE CASCADE,
  template_code   VARCHAR(30)  NOT NULL,
  template_name   VARCHAR(150) NOT NULL,
  description     TEXT,
  rating_scale_id UUID         REFERENCES appraisal_rating_scales(id),
  is_default      BOOLEAN      NOT NULL DEFAULT false,
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  created_by      UUID,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_at_client ON appraisal_templates(client_id);

CREATE TABLE IF NOT EXISTS appraisal_template_sections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID         NOT NULL REFERENCES appraisal_templates(id) ON DELETE CASCADE,
  section_code  VARCHAR(50)  NOT NULL,
  section_name  VARCHAR(100) NOT NULL,
  section_type  VARCHAR(30)  NOT NULL DEFAULT 'KPI',
  sequence      INT          NOT NULL DEFAULT 0,
  weightage     NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_required   BOOLEAN      NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_ats_template ON appraisal_template_sections(template_id);

CREATE TABLE IF NOT EXISTS appraisal_template_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID         NOT NULL REFERENCES appraisal_templates(id) ON DELETE CASCADE,
  section_id    UUID         NOT NULL REFERENCES appraisal_template_sections(id) ON DELETE CASCADE,
  item_code     VARCHAR(50)  NOT NULL,
  item_name     VARCHAR(150) NOT NULL,
  description   TEXT,
  weightage     NUMERIC(5,2) NOT NULL DEFAULT 0,
  max_score     NUMERIC(5,2) NOT NULL DEFAULT 5,
  sequence      INT          NOT NULL DEFAULT 0,
  input_type    VARCHAR(30)  NOT NULL DEFAULT 'RATING',
  is_required   BOOLEAN      NOT NULL DEFAULT true,
  is_active     BOOLEAN      NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_ati_template ON appraisal_template_items(template_id);
CREATE INDEX IF NOT EXISTS idx_ati_section  ON appraisal_template_items(section_id);

-- 3. Appraisal cycles
CREATE TABLE IF NOT EXISTS appraisal_cycles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID         NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  cycle_code          VARCHAR(30)  NOT NULL,
  cycle_name          VARCHAR(150) NOT NULL,
  financial_year      VARCHAR(20)  NOT NULL,
  appraisal_type      VARCHAR(30)  NOT NULL DEFAULT 'ANNUAL',
  review_period_from  DATE         NOT NULL,
  review_period_to    DATE         NOT NULL,
  effective_date      DATE,
  template_id         UUID         REFERENCES appraisal_templates(id),
  status              VARCHAR(20)  NOT NULL DEFAULT 'DRAFT',
  created_by          UUID,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ac_client ON appraisal_cycles(client_id);
CREATE INDEX IF NOT EXISTS idx_ac_status ON appraisal_cycles(status);

CREATE TABLE IF NOT EXISTS appraisal_cycle_scopes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id        UUID         NOT NULL REFERENCES appraisal_cycles(id) ON DELETE CASCADE,
  branch_id       UUID,
  department_id   UUID,
  designation_id  UUID,
  employment_type VARCHAR(30),
  is_active       BOOLEAN      NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_acs_cycle ON appraisal_cycle_scopes(cycle_id);

-- 4. Employee appraisals
CREATE TABLE IF NOT EXISTS employee_appraisals (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                       UUID         NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  branch_id                       UUID,
  employee_id                     UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  cycle_id                        UUID         NOT NULL REFERENCES appraisal_cycles(id) ON DELETE CASCADE,
  template_id                     UUID         REFERENCES appraisal_templates(id),
  manager_id                      UUID,
  status                          VARCHAR(30)  NOT NULL DEFAULT 'INITIATED',
  self_status                     VARCHAR(30),
  manager_status                  VARCHAR(30),
  branch_status                   VARCHAR(30),
  client_status                   VARCHAR(30),
  attendance_score                NUMERIC(5,2),
  kpi_score                       NUMERIC(5,2),
  competency_score                NUMERIC(5,2),
  total_score                     NUMERIC(5,2),
  final_rating_code               VARCHAR(30),
  final_rating_label              VARCHAR(100),
  recommendation                  VARCHAR(50),
  recommended_increment_percent   NUMERIC(5,2),
  recommended_increment_amount    NUMERIC(12,2),
  recommended_new_ctc             NUMERIC(12,2),
  promotion_designation_id        UUID,
  pip_required                    BOOLEAN      NOT NULL DEFAULT false,
  final_remarks                   TEXT,
  locked_at                       TIMESTAMPTZ,
  created_by                      UUID,
  created_at                      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ea_client   ON employee_appraisals(client_id);
CREATE INDEX IF NOT EXISTS idx_ea_branch   ON employee_appraisals(branch_id);
CREATE INDEX IF NOT EXISTS idx_ea_employee ON employee_appraisals(employee_id);
CREATE INDEX IF NOT EXISTS idx_ea_cycle    ON employee_appraisals(cycle_id);
CREATE INDEX IF NOT EXISTS idx_ea_status   ON employee_appraisals(status);

-- 5. Employee appraisal items (per-parameter ratings)
CREATE TABLE IF NOT EXISTS employee_appraisal_items (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_appraisal_id   UUID         NOT NULL REFERENCES employee_appraisals(id) ON DELETE CASCADE,
  section_id              UUID,
  template_item_id        UUID,
  item_name               VARCHAR(150) NOT NULL,
  weightage               NUMERIC(5,2) NOT NULL DEFAULT 0,
  target_value            TEXT,
  achievement_value       TEXT,
  self_rating             NUMERIC(5,2),
  manager_rating          NUMERIC(5,2),
  branch_rating           NUMERIC(5,2),
  final_rating            NUMERIC(5,2),
  weighted_score          NUMERIC(7,2),
  employee_remarks        TEXT,
  manager_remarks         TEXT,
  branch_remarks          TEXT,
  final_remarks           TEXT,
  sequence                INT          NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_eai_appraisal ON employee_appraisal_items(employee_appraisal_id);

-- 6. Approval trail
CREATE TABLE IF NOT EXISTS appraisal_approvals (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_appraisal_id   UUID         NOT NULL REFERENCES employee_appraisals(id) ON DELETE CASCADE,
  approval_level          VARCHAR(30)  NOT NULL,
  approver_id             UUID         NOT NULL,
  action                  VARCHAR(30)  NOT NULL,
  remarks                 TEXT,
  action_at               TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aa_appraisal ON appraisal_approvals(employee_appraisal_id);

-- 7. Audit log
CREATE TABLE IF NOT EXISTS appraisal_audit_logs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_appraisal_id   UUID         NOT NULL REFERENCES employee_appraisals(id) ON DELETE CASCADE,
  action                  VARCHAR(50)  NOT NULL,
  old_status              VARCHAR(30),
  new_status              VARCHAR(30),
  changed_by              UUID         NOT NULL,
  changed_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  payload                 JSONB
);
CREATE INDEX IF NOT EXISTS idx_aal_appraisal ON appraisal_audit_logs(employee_appraisal_id);

COMMIT;
