-- ============================================================
-- Migration: Compliance Document Library
-- Date: 2026-02-10
-- Description: Creates compliance_documents, compliance_document_visibility,
--              and company_settings tables.
-- ============================================================

BEGIN;

-- ── 1. compliance_doc_library ─────────────────────────────
-- Stores every file a CRM or Admin uploads into the document library.
CREATE TABLE IF NOT EXISTS compliance_doc_library (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       UUID NOT NULL,
    branch_id       UUID,                          -- NULL = company-level (visible to all branches)
    category        VARCHAR(60) NOT NULL,           -- RETURN, REGISTER, LICENSE, MCD, AUDIT_REPORT
    sub_category    VARCHAR(120),                   -- e.g. "PF Monthly Return", "Wage Register"
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    file_path       TEXT NOT NULL,                  -- relative path inside uploads/
    file_name       VARCHAR(255) NOT NULL,          -- original filename
    file_size       BIGINT DEFAULT 0,               -- bytes
    mime_type       VARCHAR(120),
    period_year     INT,
    period_month    INT,                            -- 1-12
    period_label    VARCHAR(30),                    -- e.g. "Apr-2026", "Q1-2026"
    uploaded_by     UUID NOT NULL,                  -- user who uploaded
    uploaded_role   VARCHAR(30) NOT NULL DEFAULT 'CRM', -- CRM | ADMIN | CLIENT
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cdl_client
    ON compliance_doc_library (client_id);
CREATE INDEX IF NOT EXISTS idx_cdl_client_branch
    ON compliance_doc_library (client_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_cdl_category
    ON compliance_doc_library (client_id, category);
CREATE INDEX IF NOT EXISTS idx_cdl_period
    ON compliance_doc_library (client_id, period_year, period_month);


-- ── 2. compliance_document_visibility ───────────────────
-- Explicit per-document overrides: hide a normally-visible document
-- from certain branches or roles.
CREATE TABLE IF NOT EXISTS compliance_document_visibility (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES compliance_doc_library(id) ON DELETE CASCADE,
    branch_id       UUID,                          -- NULL = rule applies to ALL branches
    role            VARCHAR(30),                   -- CLIENT | BRANCH_USER | NULL=all
    visible         BOOLEAN NOT NULL DEFAULT TRUE, -- FALSE = explicitly hidden
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_visibility_doc
    ON compliance_document_visibility (document_id);


-- ── 3. company_settings ─────────────────────────────────
-- Company-level toggles controlled by the Master Client user.
-- Replaces the narrower payroll_client_settings for access control.
CREATE TABLE IF NOT EXISTS company_settings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           UUID NOT NULL UNIQUE,
    settings            JSONB NOT NULL DEFAULT '{}'::JSONB,
    -- Expected keys in settings JSONB:
    --   allowBranchWageRegisters   : boolean (default true)
    --   allowBranchSalaryRegisters : boolean (default true)
    --   ... future toggles
    updated_by          UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_settings_client
    ON company_settings (client_id);

COMMIT;
