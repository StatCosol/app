-- Ensure doc_month column exists on contractor_documents (idempotent)
ALTER TABLE contractor_documents
  ADD COLUMN IF NOT EXISTS doc_month VARCHAR(7) NULL;

-- Backfill doc_month from created_at for legacy rows that have no value yet
UPDATE contractor_documents
SET doc_month = TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM')
WHERE doc_month IS NULL;

-- Index to speed up the checklist query (doc_month = $x)
CREATE INDEX IF NOT EXISTS idx_cd_doc_month
  ON contractor_documents (doc_month);

-- Composite index used by the checklist query
CREATE INDEX IF NOT EXISTS idx_cd_contractor_client_doc_month
  ON contractor_documents (contractor_user_id, client_id, doc_month);
