-- Migration to add document status to contractor_documents
-- Date: 2026-02-05
-- Purpose: Add status tracking for contractor documents

BEGIN;

-- Add status enum safely
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contractor_document_status') THEN
    CREATE TYPE contractor_document_status AS ENUM ('UPLOADED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED');
  END IF;
END $$;

-- Add/ensure columns exist
ALTER TABLE contractor_documents 
ADD COLUMN IF NOT EXISTS status contractor_document_status NOT NULL DEFAULT 'UPLOADED';

ALTER TABLE contractor_documents 
ADD COLUMN IF NOT EXISTS expiry_date DATE;

ALTER TABLE contractor_documents 
ADD COLUMN IF NOT EXISTS reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE contractor_documents 
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE contractor_documents 
ADD COLUMN IF NOT EXISTS review_notes TEXT;

-- Create indexes idempotently
CREATE INDEX IF NOT EXISTS idx_cd_status ON contractor_documents(status);
CREATE INDEX IF NOT EXISTS idx_cd_expiry ON contractor_documents(expiry_date) WHERE expiry_date IS NOT NULL;

COMMIT;

-- Verify changes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'contractor_documents' 
  AND column_name IN ('status', 'expiry_date', 'reviewed_by_user_id', 'reviewed_at', 'review_notes')
ORDER BY ordinal_position;
