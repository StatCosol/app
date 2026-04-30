-- Migration: AuditXpert – audit_document_reviews, audit_non_compliances, audit_resubmissions
-- Date: 2026-03-26

-- 1) Add missing columns to audits table
ALTER TABLE audits ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS final_remark TEXT;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS scheduled_date DATE;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS scheduled_by_user_id UUID REFERENCES users(id);

-- Widen status column to accommodate REVERIFICATION_PENDING (24 chars)
ALTER TABLE audits ALTER COLUMN status TYPE varchar(30);

-- Add reverification-related statuses (extend status CHECK if exists)
-- Current: PLANNED, IN_PROGRESS, COMPLETED, CANCELLED
-- Add: SUBMITTED, CORRECTION_PENDING, REVERIFICATION_PENDING, CLOSED
DO $$
BEGIN
  -- Drop old check constraint if exists so we can expand allowed values
  ALTER TABLE audits DROP CONSTRAINT IF EXISTS chk_audits_status;
  ALTER TABLE audits ADD CONSTRAINT chk_audits_status
    CHECK (status IN (
      'PLANNED','IN_PROGRESS','COMPLETED','CANCELLED',
      'SUBMITTED','CORRECTION_PENDING','REVERIFICATION_PENDING','CLOSED'
    ));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2) audit_document_reviews – per-document auditor review records
CREATE TABLE IF NOT EXISTS audit_document_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  document_id UUID NOT NULL,
  source_table VARCHAR(30) NOT NULL DEFAULT 'contractor_documents',
  checklist_item_id UUID REFERENCES audit_checklist_items(id) ON DELETE SET NULL,
  compliance_mark VARCHAR(20) NOT NULL CHECK (compliance_mark IN ('COMPLIED','NON_COMPLIED','NOT_APPLICABLE')),
  auditor_remark TEXT,
  version INT NOT NULL DEFAULT 1,
  reviewed_by UUID NOT NULL REFERENCES users(id),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_doc_reviews_audit ON audit_document_reviews(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_doc_reviews_doc ON audit_document_reviews(document_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_audit_doc_reviews_audit_doc_ver
  ON audit_document_reviews(audit_id, document_id, source_table, version);

-- 3) audit_non_compliances – NC tracker
CREATE TABLE IF NOT EXISTS audit_non_compliances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  document_id UUID,
  source_table VARCHAR(30),
  checklist_item_id UUID REFERENCES audit_checklist_items(id) ON DELETE SET NULL,
  document_review_id UUID REFERENCES audit_document_reviews(id) ON DELETE SET NULL,
  document_name VARCHAR(512),
  requested_to_role VARCHAR(30),
  requested_to_user_id UUID REFERENCES users(id),
  remark TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'NC_RAISED'
    CHECK (status IN ('NC_RAISED','AWAITING_REUPLOAD','REUPLOADED','REVERIFICATION_PENDING','ACCEPTED','CLOSED')),
  raised_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_nc_audit ON audit_non_compliances(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_nc_status ON audit_non_compliances(status);
CREATE INDEX IF NOT EXISTS idx_audit_nc_requested_to ON audit_non_compliances(requested_to_user_id);

-- 4) audit_resubmissions – corrected document upload tracking
CREATE TABLE IF NOT EXISTS audit_resubmissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  non_compliance_id UUID NOT NULL REFERENCES audit_non_compliances(id) ON DELETE CASCADE,
  document_id UUID,
  source_table VARCHAR(30),
  file_path TEXT,
  file_name VARCHAR(512),
  mime_type VARCHAR(128),
  file_size BIGINT DEFAULT 0,
  resubmitted_by UUID NOT NULL REFERENCES users(id),
  resubmitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  auditor_remark TEXT,
  final_mark VARCHAR(20) CHECK (final_mark IN ('COMPLIED','NON_COMPLIED','NOT_APPLICABLE')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_resub_audit ON audit_resubmissions(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_resub_nc ON audit_resubmissions(non_compliance_id);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_audit_doc_reviews_ts() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_audit_doc_reviews_ts ON audit_document_reviews;
CREATE TRIGGER trg_audit_doc_reviews_ts BEFORE UPDATE ON audit_document_reviews
  FOR EACH ROW EXECUTE FUNCTION update_audit_doc_reviews_ts();

CREATE OR REPLACE FUNCTION update_audit_nc_ts() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_audit_nc_ts ON audit_non_compliances;
CREATE TRIGGER trg_audit_nc_ts BEFORE UPDATE ON audit_non_compliances
  FOR EACH ROW EXECUTE FUNCTION update_audit_nc_ts();

CREATE OR REPLACE FUNCTION update_audit_resub_ts() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_audit_resub_ts ON audit_resubmissions;
CREATE TRIGGER trg_audit_resub_ts BEFORE UPDATE ON audit_resubmissions
  FOR EACH ROW EXECUTE FUNCTION update_audit_resub_ts();
