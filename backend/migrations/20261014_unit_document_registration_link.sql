-- Additive link; historical uploads are not matched by filename or inferred dates.
ALTER TABLE crm_unit_documents ADD COLUMN IF NOT EXISTS registration_id uuid;
CREATE INDEX IF NOT EXISTS idx_unit_document_registration ON crm_unit_documents(registration_id);
