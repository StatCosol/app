-- Migration: branch_documents + establishment_type column
-- Date: 2026-02-10
-- Purpose: Add establishment_type to client_branches; create branch_documents table for client-scope uploads

BEGIN;

-- 1) Add establishment_type to client_branches (HO, BRANCH, FACTORY, WAREHOUSE, SHOP)
ALTER TABLE client_branches
  ADD COLUMN IF NOT EXISTS establishment_type VARCHAR(30) DEFAULT 'BRANCH';

-- Back-fill: map existing branchtype values
UPDATE client_branches SET establishment_type = 'HO' WHERE branchtype = 'HO';
UPDATE client_branches SET establishment_type = 'FACTORY' WHERE branchtype = 'FACTORY';

-- Add city/pincode mapping to entity (columns already exist from original schema)
-- No DDL needed — they were kept during the entity_schema_reconciliation migration.

-- 2) Create branch_documents table
CREATE TABLE IF NOT EXISTS branch_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  branch_id UUID NOT NULL REFERENCES client_branches(id),
  category VARCHAR(50) NOT NULL DEFAULT 'REGISTRATION',
  doc_type VARCHAR(255) NOT NULL,
  period_year INT,
  period_month INT,
  file_path TEXT NOT NULL,
  file_name VARCHAR(512) NOT NULL,
  mime_type VARCHAR(128),
  file_size BIGINT DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'UPLOADED',
  reviewer_role VARCHAR(30),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  remarks TEXT,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_branchdoc_client ON branch_documents(client_id);
CREATE INDEX IF NOT EXISTS idx_branchdoc_branch ON branch_documents(branch_id);
CREATE INDEX IF NOT EXISTS idx_branchdoc_category ON branch_documents(category);
CREATE INDEX IF NOT EXISTS idx_branchdoc_status ON branch_documents(status);
CREATE INDEX IF NOT EXISTS idx_branchdoc_period ON branch_documents(period_year, period_month);

-- Constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_branchdoc_category'
  ) THEN
    ALTER TABLE branch_documents
      ADD CONSTRAINT chk_branchdoc_category
      CHECK (category IN ('REGISTRATION', 'COMPLIANCE_MONTHLY', 'AUDIT_EVIDENCE'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_branchdoc_status'
  ) THEN
    ALTER TABLE branch_documents
      ADD CONSTRAINT chk_branchdoc_status
      CHECK (status IN ('UPLOADED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'));
  END IF;
END $$;

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_branch_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_branch_documents_updated_at ON branch_documents;

CREATE TRIGGER trigger_update_branch_documents_updated_at
BEFORE UPDATE ON branch_documents
FOR EACH ROW
EXECUTE FUNCTION update_branch_documents_updated_at();

COMMIT;
