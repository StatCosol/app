-- Migration: contractor_required_documents mapping
-- Date: 2026-02-10
-- Purpose: Track required document types per contractor (optionally scoped to branch) for compliance KPIs

BEGIN;

CREATE TABLE IF NOT EXISTS contractor_required_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  contractor_id UUID NOT NULL REFERENCES users(id),
  branch_id UUID REFERENCES client_branches(id),
  doc_type VARCHAR(255) NOT NULL,
  is_required BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_crd_contractor ON contractor_required_documents(contractor_id);
CREATE INDEX IF NOT EXISTS idx_crd_client ON contractor_required_documents(client_id);
CREATE INDEX IF NOT EXISTS idx_crd_branch ON contractor_required_documents(branch_id);
CREATE INDEX IF NOT EXISTS idx_crd_doc_type ON contractor_required_documents(doc_type);

-- Optional: prevent duplicate doc_type rows per contractor + branch scope
CREATE UNIQUE INDEX IF NOT EXISTS uq_crd_contractor_branch_doc
  ON contractor_required_documents(contractor_id, branch_id, doc_type);

CREATE OR REPLACE FUNCTION update_contractor_required_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_contractor_required_documents_updated_at ON contractor_required_documents;

CREATE TRIGGER trigger_update_contractor_required_documents_updated_at
BEFORE UPDATE ON contractor_required_documents
FOR EACH ROW
EXECUTE FUNCTION update_contractor_required_documents_updated_at();

COMMIT;
