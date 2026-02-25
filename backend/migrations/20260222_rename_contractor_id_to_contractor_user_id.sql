BEGIN;

-- 1. contractor_documents
ALTER TABLE contractor_documents RENAME COLUMN contractor_id TO contractor_user_id;
DROP INDEX IF EXISTS idx_cd_contractor_id;
CREATE INDEX idx_cd_contractor_user_id ON contractor_documents(contractor_user_id);

-- 2. contractor_required_documents
ALTER TABLE contractor_required_documents RENAME COLUMN contractor_id TO contractor_user_id;
DROP INDEX IF EXISTS idx_crd_contractor;
CREATE INDEX idx_crd_contractor ON contractor_required_documents(contractor_user_id);

-- 3. document_reupload_requests
ALTER TABLE document_reupload_requests RENAME COLUMN contractor_id TO contractor_user_id;

-- Rebuild composite indexes that referenced old column
DROP INDEX IF EXISTS idx_cd_contractor_docs_lookup;
CREATE INDEX IF NOT EXISTS idx_cd_contractor_docs_composite
  ON contractor_documents (client_id, doc_month, contractor_user_id);

COMMIT;
