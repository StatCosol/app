CREATE TABLE IF NOT EXISTS payroll_document_checks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES contractor_documents(id),
 file_path text NOT NULL, file_hash varchar(64) NOT NULL, payroll_version_id uuid REFERENCES contractor_payroll_versions(id),
 status varchar(20) NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_document_checks_document ON payroll_document_checks(document_id,created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS payroll_document_checks_dedupe ON payroll_document_checks(document_id,file_path,file_hash,COALESCE(payroll_version_id,'00000000-0000-0000-0000-000000000000'::uuid));
