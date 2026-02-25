-- Add uploader_remarks column to compliance_documents
-- Allows branch users to add remarks when uploading documents,
-- visible to CRM reviewers alongside the reviewer's own remarks.

ALTER TABLE compliance_documents
  ADD COLUMN IF NOT EXISTS uploader_remarks TEXT DEFAULT NULL;

COMMENT ON COLUMN compliance_documents.uploader_remarks
  IS 'Optional remarks entered by the branch user at upload time';
