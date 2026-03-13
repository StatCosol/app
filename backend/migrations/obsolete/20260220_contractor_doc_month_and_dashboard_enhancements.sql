-- Add doc_month column to contractor_documents for month-based document tracking
ALTER TABLE contractor_documents
    ADD COLUMN IF NOT EXISTS doc_month VARCHAR(7) NULL; -- YYYY-MM format

-- Backfill doc_month from created_at for existing records
UPDATE contractor_documents
SET doc_month = TO_CHAR(created_at, 'YYYY-MM')
WHERE doc_month IS NULL;

-- Index for efficient month-based queries on contractor documents
CREATE INDEX IF NOT EXISTS idx_cd_doc_month
    ON contractor_documents (doc_month);

-- Composite index for the dashboard contractor upload summary query
CREATE INDEX IF NOT EXISTS idx_cd_client_month_contractor
    ON contractor_documents (client_id, doc_month, contractor_id);
