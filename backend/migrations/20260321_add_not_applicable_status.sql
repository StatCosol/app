-- Migration: Add NOT_APPLICABLE to compliance_documents status CHECK constraint
-- Date: 2026-03-21
-- Reason: Branch/Factory/Office compliance pages now allow marking items as Not Applicable

-- Drop the old constraint
ALTER TABLE compliance_documents
DROP CONSTRAINT IF EXISTS chk_compdoc_status;

-- Re-create with NOT_APPLICABLE included
ALTER TABLE compliance_documents
ADD CONSTRAINT chk_compdoc_status
CHECK (status IN ('NOT_UPLOADED','SUBMITTED','APPROVED','REUPLOAD_REQUIRED','RESUBMITTED','OVERDUE','NOT_APPLICABLE'));
