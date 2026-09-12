ALTER TABLE payroll_document_checks ADD COLUMN IF NOT EXISTS check_profile varchar(32) NOT NULL DEFAULT 'tables-v1';
DROP INDEX IF EXISTS payroll_document_checks_dedupe;
CREATE UNIQUE INDEX IF NOT EXISTS payroll_document_checks_dedupe ON payroll_document_checks(document_id,file_path,file_hash,COALESCE(payroll_version_id,'00000000-0000-0000-0000-000000000000'::uuid),check_profile);
