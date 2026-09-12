ALTER TABLE branch_documents ADD COLUMN IF NOT EXISTS expiry_date date;
CREATE INDEX IF NOT EXISTS idx_branch_documents_expiry
  ON branch_documents(expiry_date) WHERE expiry_date IS NOT NULL;
