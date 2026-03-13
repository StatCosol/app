-- =============================================================
-- Migration: Branch Compliance Documents (Monthly MCD + Returns)
-- Date: 2026-02-25
-- Description: Unified compliance_documents table for branch
--   monthly uploads, quarterly, half-yearly, and yearly returns.
--   Plus compliance_return_master for the return type catalog.
--   Includes FK constraints, analytics indexes, updated_at
--   trigger, and complete seed data for all 4 frequencies.
-- =============================================================

BEGIN;

-- ===========================================================
-- 1) compliance_return_master — catalog of all return types
-- ===========================================================
CREATE TABLE IF NOT EXISTS compliance_return_master (
  return_code       VARCHAR(60)   PRIMARY KEY,
  return_name       VARCHAR(200)  NOT NULL,
  law_area          VARCHAR(40)   NOT NULL,          -- PF, ESI, FACTORY, CLRA, PT, LWF, BONUS, GRATUITY, OTHER
  frequency         VARCHAR(20)   NOT NULL DEFAULT 'MONTHLY',  -- MONTHLY | QUARTERLY | HALF_YEARLY | YEARLY
  scope_default     VARCHAR(20)   NOT NULL DEFAULT 'BRANCH',   -- BRANCH | COMPANY
  applicable_for    VARCHAR(20)   NOT NULL DEFAULT 'BOTH',     -- FACTORY | ESTABLISHMENT | BOTH
  due_day           INT,                               -- day-of-month the return is due (nullable)
  category          VARCHAR(60),                       -- grouping: ATTENDANCE_WAGE, PF_ESI, FACTORY, STATUTORY, etc.
  is_active         BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ===========================================================
-- 2) compliance_documents — unified branch document uploads
-- ===========================================================
CREATE TABLE IF NOT EXISTS compliance_documents (
  id                   UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID,                                    -- multi-tenant org id (nullable)
  company_id           UUID           NOT NULL,                 -- client master id
  branch_id            UUID,                                    -- nullable if company-level
  module_source        VARCHAR(30)    NOT NULL DEFAULT 'BRANCHDESK', -- BRANCHDESK | CRM | CONTRACTOR | AUDITXPERT
  document_scope       VARCHAR(20)    NOT NULL DEFAULT 'BRANCH',     -- BRANCH | CONTRACTOR | COMPANY
  law_area             VARCHAR(40)    NOT NULL,
  return_code          VARCHAR(60)    NOT NULL,
  return_name          VARCHAR(200)   NOT NULL,                 -- display name at time of upload
  frequency            VARCHAR(20)    NOT NULL DEFAULT 'MONTHLY',
  period_year          INT            NOT NULL,
  period_month         INT,                                     -- 1-12, nullable for non-monthly
  period_quarter       INT,                                     -- 1-4, nullable
  period_half          INT,                                     -- 1-2, nullable
  due_date             DATE,
  uploaded_file_url    VARCHAR(500),
  uploaded_file_name   VARCHAR(300),
  uploaded_by_user_id  UUID,
  uploaded_at          TIMESTAMPTZ,
  status               VARCHAR(30)    NOT NULL DEFAULT 'NOT_UPLOADED',
    -- NOT_UPLOADED | SUBMITTED | APPROVED | REUPLOAD_REQUIRED | RESUBMITTED | OVERDUE
  reviewed_by_user_id  UUID,
  reviewed_at          TIMESTAMPTZ,
  remarks              TEXT,
  version              INT            NOT NULL DEFAULT 1,
  is_locked            BOOLEAN        NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ===========================================================
-- 3) Foreign Key Constraints
-- ===========================================================
-- company_id → clients.id
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_compdoc_company') THEN
    ALTER TABLE compliance_documents
      ADD CONSTRAINT fk_compdoc_company
      FOREIGN KEY (company_id) REFERENCES clients (id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- branch_id → client_branches.id (nullable)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_compdoc_branch') THEN
    ALTER TABLE compliance_documents
      ADD CONSTRAINT fk_compdoc_branch
      FOREIGN KEY (branch_id) REFERENCES client_branches (id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- return_code → compliance_return_master.return_code
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_compdoc_return_code') THEN
    ALTER TABLE compliance_documents
      ADD CONSTRAINT fk_compdoc_return_code
      FOREIGN KEY (return_code) REFERENCES compliance_return_master (return_code)
      ON UPDATE CASCADE;
  END IF;
END $$;

-- uploaded_by_user_id → users.id
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_compdoc_uploaded_by') THEN
    ALTER TABLE compliance_documents
      ADD CONSTRAINT fk_compdoc_uploaded_by
      FOREIGN KEY (uploaded_by_user_id) REFERENCES users (id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- reviewed_by_user_id → users.id
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_compdoc_reviewed_by') THEN
    ALTER TABLE compliance_documents
      ADD CONSTRAINT fk_compdoc_reviewed_by
      FOREIGN KEY (reviewed_by_user_id) REFERENCES users (id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Unique constraint: one document per return per period per branch
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_compdoc_branch_return_period') THEN
    ALTER TABLE compliance_documents
      ADD CONSTRAINT uq_compdoc_branch_return_period
      UNIQUE (branch_id, return_code, period_year, period_month, period_quarter, period_half);
  END IF;
END $$;

-- ===========================================================
-- 4) Check Constraints
-- ===========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_compdoc_status') THEN
    ALTER TABLE compliance_documents
      ADD CONSTRAINT chk_compdoc_status
      CHECK (status IN ('NOT_UPLOADED','SUBMITTED','APPROVED','REUPLOAD_REQUIRED','RESUBMITTED','OVERDUE'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_compdoc_frequency') THEN
    ALTER TABLE compliance_documents
      ADD CONSTRAINT chk_compdoc_frequency
      CHECK (frequency IN ('MONTHLY','QUARTERLY','HALF_YEARLY','YEARLY'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_compdoc_module_source') THEN
    ALTER TABLE compliance_documents
      ADD CONSTRAINT chk_compdoc_module_source
      CHECK (module_source IN ('BRANCHDESK','CRM','CONTRACTOR','AUDITXPERT'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_compdoc_document_scope') THEN
    ALTER TABLE compliance_documents
      ADD CONSTRAINT chk_compdoc_document_scope
      CHECK (document_scope IN ('BRANCH','CONTRACTOR','COMPANY'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_compdoc_period_month') THEN
    ALTER TABLE compliance_documents
      ADD CONSTRAINT chk_compdoc_period_month
      CHECK (period_month IS NULL OR (period_month >= 1 AND period_month <= 12));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_compdoc_period_quarter') THEN
    ALTER TABLE compliance_documents
      ADD CONSTRAINT chk_compdoc_period_quarter
      CHECK (period_quarter IS NULL OR (period_quarter >= 1 AND period_quarter <= 4));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_compdoc_period_half') THEN
    ALTER TABLE compliance_documents
      ADD CONSTRAINT chk_compdoc_period_half
      CHECK (period_half IS NULL OR (period_half >= 1 AND period_half <= 2));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_retmaster_frequency') THEN
    ALTER TABLE compliance_return_master
      ADD CONSTRAINT chk_retmaster_frequency
      CHECK (frequency IN ('MONTHLY','QUARTERLY','HALF_YEARLY','YEARLY'));
  END IF;
END $$;

-- ===========================================================
-- 5) Basic Indexes
-- ===========================================================
CREATE INDEX IF NOT EXISTS idx_compdoc_company   ON compliance_documents (company_id);
CREATE INDEX IF NOT EXISTS idx_compdoc_branch    ON compliance_documents (branch_id);
CREATE INDEX IF NOT EXISTS idx_compdoc_status    ON compliance_documents (status);
CREATE INDEX IF NOT EXISTS idx_compdoc_freq      ON compliance_documents (frequency);
CREATE INDEX IF NOT EXISTS idx_compdoc_period    ON compliance_documents (period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_compdoc_retcode   ON compliance_documents (return_code);
CREATE INDEX IF NOT EXISTS idx_compdoc_due       ON compliance_documents (due_date);

-- ===========================================================
-- 6) Analytics / Intelligence Performance Indexes
-- ===========================================================

-- Composite: branch + company + year
-- Used by: getComplianceTrend, calculateRiskExposure,
--          getSidebarBadges, getBranchComplianceDashboard
CREATE INDEX IF NOT EXISTS idx_compdoc_branch_company_year
  ON compliance_documents (branch_id, company_id, period_year);

-- Composite: company + year (no branch)
-- Used by: getLowestComplianceBranches, company-wide trend
CREATE INDEX IF NOT EXISTS idx_compdoc_company_year
  ON compliance_documents (company_id, period_year);

-- Composite: branch + year + month
-- Used by: trend query aggregation per month
CREATE INDEX IF NOT EXISTS idx_compdoc_branch_year_month
  ON compliance_documents (branch_id, period_year, period_month);

-- Composite: company + year + status
-- Used by: risk exposure, weighted compliance, client KPIs
CREATE INDEX IF NOT EXISTS idx_compdoc_company_year_status
  ON compliance_documents (company_id, period_year, status);

-- Partial: overdue-only fast lookup
-- Used by: sidebar badges, risk scoring, overdue checks
CREATE INDEX IF NOT EXISTS idx_compdoc_overdue
  ON compliance_documents (branch_id, company_id, period_year)
  WHERE status = 'OVERDUE';

-- Partial: reupload-only fast lookup
-- Used by: sidebar badges, risk scoring
CREATE INDEX IF NOT EXISTS idx_compdoc_reupload
  ON compliance_documents (branch_id, company_id, period_year)
  WHERE status = 'REUPLOAD_REQUIRED';

-- Partial: not-uploaded docs due soon (cron reminders)
-- Used by: getDocsDueSoon for T-5 and T-2 reminders
CREATE INDEX IF NOT EXISTS idx_compdoc_due_pending
  ON compliance_documents (due_date)
  WHERE status IN ('NOT_UPLOADED', 'SUBMITTED', 'RESUBMITTED');

-- Composite: branch + frequency + year
-- Used by: weighted compliance grouping by frequency
CREATE INDEX IF NOT EXISTS idx_compdoc_branch_freq_year
  ON compliance_documents (branch_id, frequency, period_year);

-- ===========================================================
-- 7) Auto-update updated_at trigger
-- ===========================================================
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS compliance_documents_updated_at ON compliance_documents;
CREATE TRIGGER compliance_documents_updated_at
  BEFORE UPDATE ON compliance_documents
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS compliance_return_master_updated_at ON compliance_return_master;
CREATE TRIGGER compliance_return_master_updated_at
  BEFORE UPDATE ON compliance_return_master
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ===========================================================
-- 8) Seed: compliance_return_master — MONTHLY MCD types
-- ===========================================================

-- A. Attendance & Wage Related
INSERT INTO compliance_return_master (return_code, return_name, law_area, frequency, category, applicable_for, due_day)
VALUES
  ('ATTENDANCE_REGISTER',  'Employee Attendance Register',   'LABOUR',   'MONTHLY', 'ATTENDANCE_WAGE', 'BOTH', 25),
  ('WAGE_REGISTER',        'Wage Register',                  'LABOUR',   'MONTHLY', 'ATTENDANCE_WAGE', 'BOTH', 25),
  ('OT_REGISTER',          'OT Register',                    'LABOUR',   'MONTHLY', 'ATTENDANCE_WAGE', 'BOTH', 25),
  ('LEAVE_REGISTER',       'Leave Register',                 'LABOUR',   'MONTHLY', 'ATTENDANCE_WAGE', 'BOTH', 25),
  ('MUSTER_ROLL',          'Muster Roll',                    'LABOUR',   'MONTHLY', 'ATTENDANCE_WAGE', 'BOTH', 25),
  ('ABSENTEE_STATEMENT',   'Absentee Statement',             'LABOUR',   'MONTHLY', 'ATTENDANCE_WAGE', 'BOTH', 25)
ON CONFLICT (return_code) DO NOTHING;

-- B. PF & ESI Compliance
INSERT INTO compliance_return_master (return_code, return_name, law_area, frequency, category, applicable_for, due_day)
VALUES
  ('PF_ECR',               'PF ECR Copy',                    'PF',       'MONTHLY', 'PF_ESI', 'BOTH', 15),
  ('PF_CHALLAN',           'PF Challan',                     'PF',       'MONTHLY', 'PF_ESI', 'BOTH', 15),
  ('ESI_CHALLAN',          'ESI Challan',                    'ESI',      'MONTHLY', 'PF_ESI', 'BOTH', 15),
  ('ESI_CONTRIBUTION',     'ESI Contribution Report',        'ESI',      'MONTHLY', 'PF_ESI', 'BOTH', 15),
  ('NEW_JOINER_PF_ESI',    'New Joiners PF/ESI Registration','PF',       'MONTHLY', 'PF_ESI', 'BOTH', 25),
  ('EXIT_EMPLOYEES',       'Exit Employees List',            'PF',       'MONTHLY', 'PF_ESI', 'BOTH', 25)
ON CONFLICT (return_code) DO NOTHING;

-- C. Factory / Establishment Compliance
INSERT INTO compliance_return_master (return_code, return_name, law_area, frequency, category, applicable_for, due_day)
VALUES
  ('FORM_22_24',           'Form 22 / 24 (Factories)',       'FACTORY',  'MONTHLY', 'FACTORY', 'FACTORY', 25),
  ('ACCIDENT_REGISTER',    'Accident Register',              'FACTORY',  'MONTHLY', 'FACTORY', 'FACTORY', 25),
  ('SAFETY_INSPECTION',    'Safety Inspection Register',     'FACTORY',  'MONTHLY', 'FACTORY', 'FACTORY', 25),
  ('OVERTIME_REGISTER',    'Overtime Register',              'FACTORY',  'MONTHLY', 'FACTORY', 'BOTH',    25),
  ('ADULT_WORKER_REGISTER','Adult Worker Register',          'FACTORY',  'MONTHLY', 'FACTORY', 'FACTORY', 25),
  ('CONTRACTOR_WORKER_REG','Contractor Worker Register (Branch Copy)', 'CLRA', 'MONTHLY', 'FACTORY', 'BOTH', 25)
ON CONFLICT (return_code) DO NOTHING;

-- D. Statutory Payments
INSERT INTO compliance_return_master (return_code, return_name, law_area, frequency, category, applicable_for, due_day)
VALUES
  ('PT_CHALLAN',           'PT Payment Challan',             'PT',       'MONTHLY', 'STATUTORY', 'BOTH', 20),
  ('LWF_PAYMENT',          'LWF Payment Copy',               'LWF',     'MONTHLY', 'STATUTORY', 'BOTH', 20),
  ('BONUS_PAYMENT',        'Bonus Payment Working',          'BONUS',   'MONTHLY', 'STATUTORY', 'BOTH', 25)
ON CONFLICT (return_code) DO NOTHING;

-- ===========================================================
-- 9) Seed: QUARTERLY return types
-- ===========================================================

-- Professional Tax (state-specific quarterly returns)
INSERT INTO compliance_return_master (return_code, return_name, law_area, frequency, category, applicable_for, due_day)
VALUES
  ('PT_QUARTERLY_RETURN',  'PT Quarterly Return',            'PT',       'QUARTERLY', 'STATUTORY', 'BOTH', 15),
  ('PT_QTR_CHALLAN',       'PT Quarterly Payment Challan',   'PT',       'QUARTERLY', 'STATUTORY', 'BOTH', 15)
ON CONFLICT (return_code) DO NOTHING;

-- TDS/TCS Quarterly
INSERT INTO compliance_return_master (return_code, return_name, law_area, frequency, category, applicable_for, due_day)
VALUES
  ('TDS_QTR_24Q',          'TDS Quarterly Return (Form 24Q)','TDS',      'QUARTERLY', 'STATUTORY', 'BOTH', 15),
  ('TDS_QTR_26Q',          'TDS Quarterly Return (Form 26Q)','TDS',      'QUARTERLY', 'STATUTORY', 'BOTH', 15)
ON CONFLICT (return_code) DO NOTHING;

-- ESI Quarterly (contribution statement)
INSERT INTO compliance_return_master (return_code, return_name, law_area, frequency, category, applicable_for, due_day)
VALUES
  ('ESI_QTR_CONTRIBUTION', 'ESI Quarterly Contribution Statement','ESI', 'QUARTERLY', 'PF_ESI', 'BOTH', 15)
ON CONFLICT (return_code) DO NOTHING;

-- CLRA Quarterly
INSERT INTO compliance_return_master (return_code, return_name, law_area, frequency, category, applicable_for, due_day)
VALUES
  ('CLRA_QTR_RETURN',      'CLRA Quarterly Progress Report', 'CLRA',     'QUARTERLY', 'FACTORY', 'BOTH', 25)
ON CONFLICT (return_code) DO NOTHING;

-- Labour Welfare Fund (half-yearly in some states, quarterly in others)
INSERT INTO compliance_return_master (return_code, return_name, law_area, frequency, category, applicable_for, due_day)
VALUES
  ('LWF_QTR_RETURN',       'LWF Quarterly Return',           'LWF',      'QUARTERLY', 'STATUTORY', 'BOTH', 15)
ON CONFLICT (return_code) DO NOTHING;

-- ===========================================================
-- 10) Seed: HALF-YEARLY return types
-- ===========================================================

INSERT INTO compliance_return_master (return_code, return_name, law_area, frequency, category, applicable_for, due_day)
VALUES
  ('FACTORY_HY_RETURN_H1', 'Half-Yearly Return H1 (Factories Act)',  'FACTORY','HALF_YEARLY', 'FACTORY', 'FACTORY', 15),
  ('FACTORY_HY_RETURN_H2', 'Half-Yearly Return H2 (Factories Act)',  'FACTORY','HALF_YEARLY', 'FACTORY', 'FACTORY', 15),
  ('ESI_HY_ACCIDENT_RPT',  'ESI Half-Yearly Accident Report',        'ESI',    'HALF_YEARLY', 'PF_ESI',  'BOTH',    15),
  ('LWF_HY_RETURN',        'LWF Half-Yearly Return + Challan',       'LWF',    'HALF_YEARLY', 'STATUTORY','BOTH',    30),
  ('CLRA_HY_PROGRESS',     'CLRA Half-Yearly Progress Report',       'CLRA',   'HALF_YEARLY', 'FACTORY', 'BOTH',    25)
ON CONFLICT (return_code) DO NOTHING;

-- ===========================================================
-- 11) Seed: YEARLY return types
-- ===========================================================

-- PF Annual
INSERT INTO compliance_return_master (return_code, return_name, law_area, frequency, category, applicable_for, due_day)
VALUES
  ('PF_ANNUAL_RECON',      'PF Annual Reconciliation / Summary Pack', 'PF', 'YEARLY', 'PF_ESI', 'BOTH', 30),
  ('PF_FORM_3A_6A',        'Form 3A/6A Annual Member Statement Pack','PF', 'YEARLY', 'PF_ESI', 'BOTH', 30)
ON CONFLICT (return_code) DO NOTHING;

-- ESI Annual
INSERT INTO compliance_return_master (return_code, return_name, law_area, frequency, category, applicable_for, due_day)
VALUES
  ('ESI_ANNUAL_SUMMARY',   'ESI Annual Contribution Summary Pack',    'ESI', 'YEARLY', 'PF_ESI', 'BOTH', 30)
ON CONFLICT (return_code) DO NOTHING;

-- LWF Annual
INSERT INTO compliance_return_master (return_code, return_name, law_area, frequency, category, applicable_for, due_day)
VALUES
  ('LWF_ANNUAL_RETURN',    'LWF Annual Return + Challan',   'LWF', 'YEARLY', 'STATUTORY', 'BOTH', 30)
ON CONFLICT (return_code) DO NOTHING;

-- PT Annual
INSERT INTO compliance_return_master (return_code, return_name, law_area, frequency, category, applicable_for, due_day)
VALUES
  ('PT_ANNUAL_RETURN',     'PT Annual Return',              'PT',  'YEARLY', 'STATUTORY', 'BOTH', 30)
ON CONFLICT (return_code) DO NOTHING;

-- Bonus Annual
INSERT INTO compliance_return_master (return_code, return_name, law_area, frequency, category, applicable_for, due_day)
VALUES
  ('BONUS_ANNUAL_RETURN',  'Bonus Return / Annual Statement','BONUS','YEARLY', 'STATUTORY', 'BOTH', 30)
ON CONFLICT (return_code) DO NOTHING;

-- CLRA Annual
INSERT INTO compliance_return_master (return_code, return_name, law_area, frequency, category, applicable_for, due_day)
VALUES
  ('CLRA_ANNUAL_RETURN',   'Annual Return under CLRA',      'CLRA', 'YEARLY', 'FACTORY', 'BOTH', 30)
ON CONFLICT (return_code) DO NOTHING;

-- Factory Annual
INSERT INTO compliance_return_master (return_code, return_name, law_area, frequency, category, applicable_for, due_day)
VALUES
  ('FACTORY_ANNUAL_RETURN','Annual Return (Factories Act)',  'FACTORY','YEARLY', 'FACTORY', 'FACTORY', 30)
ON CONFLICT (return_code) DO NOTHING;

-- Gratuity
INSERT INTO compliance_return_master (return_code, return_name, law_area, frequency, category, applicable_for, due_day)
VALUES
  ('GRATUITY_NOMINATION',  'Gratuity Nomination / Summary',  'GRATUITY','YEARLY', 'STATUTORY', 'BOTH', 30)
ON CONFLICT (return_code) DO NOTHING;

-- Shops & Establishments Annual
INSERT INTO compliance_return_master (return_code, return_name, law_area, frequency, category, applicable_for, due_day)
VALUES
  ('SHOPS_EST_RENEWAL',    'Shops & Establishment Registration Renewal', 'LABOUR', 'YEARLY', 'STATUTORY', 'ESTABLISHMENT', 30),
  ('FACTORY_LICENSE_RENEW', 'Factory License Renewal',                   'FACTORY','YEARLY', 'FACTORY',   'FACTORY',       30),
  ('TRADE_LICENSE_RENEW',   'Trade License Renewal',                     'LABOUR', 'YEARLY', 'STATUTORY', 'BOTH',          30),
  ('FIRE_SAFETY_CERT',     'Fire Safety Certificate Renewal',            'FACTORY','YEARLY', 'FACTORY',   'BOTH',          30),
  ('POLLUTION_CONSENT',    'Pollution Consent Renewal',                  'FACTORY','YEARLY', 'FACTORY',   'FACTORY',       30)
ON CONFLICT (return_code) DO NOTHING;

-- ===========================================================
-- 12) Materialized View: compliance_coverage_summary
--     Refreshed by cron for fast dashboard reads
-- ===========================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_compliance_coverage AS
  SELECT
    company_id,
    branch_id,
    period_year,
    frequency,
    COUNT(*)::int                                        AS total,
    COUNT(*) FILTER (WHERE status = 'APPROVED')::int     AS approved,
    COUNT(*) FILTER (WHERE status = 'OVERDUE')::int      AS overdue,
    COUNT(*) FILTER (WHERE status = 'REUPLOAD_REQUIRED')::int AS reupload,
    COUNT(*) FILTER (WHERE status IN ('NOT_UPLOADED','SUBMITTED','RESUBMITTED'))::int AS pending,
    CASE WHEN COUNT(*) > 0
      THEN ROUND(COUNT(*) FILTER (WHERE status = 'APPROVED')::numeric / COUNT(*)::numeric * 100, 1)
      ELSE 0
    END AS compliance_pct
  FROM compliance_documents
  GROUP BY company_id, branch_id, period_year, frequency;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_compcov_pk
  ON mv_compliance_coverage (company_id, branch_id, period_year, frequency);

COMMIT;
