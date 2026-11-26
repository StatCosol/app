-- Index every stored-file path column that FilesService.assertCanDownload
-- looks up. Each /uploads request matches the requested path against these
-- columns in turn; without an index every lookup is a full table scan, so a
-- single file open could scan up to 23 tables.
--
-- A table or column missing in some environment is skipped rather than
-- failing the deploy (the download check already tolerates missing tables).
-- EXECUTE parses each statement only when it runs, which is what makes the
-- existence check effective.
DO $$
DECLARE
  spec text[];
  specs text[][] := ARRAY[
    ARRAY['contractor_documents', 'file_path'],
    ARRAY['payroll_input_files', 'file_path'],
    ARRAY['registers_records', 'file_path'],
    ARRAY['helpdesk_message_files', 'file_path'],
    ARRAY['compliance_evidence', 'file_path'],
    ARRAY['notice_documents', 'file_url'],
    ARRAY['employee_generated_forms', 'file_path'],
    ARRAY['compliance_returns', 'ack_file_path'],
    ARRAY['compliance_returns', 'challan_file_path'],
    ARRAY['branch_registrations', 'document_path'],
    ARRAY['branch_registrations', 'document_url'],
    ARRAY['branch_registrations', 'renewal_document_url'],
    ARRAY['compliance_documents', 'uploaded_file_url'],
    ARRAY['compliance_doc_library', 'file_path'],
    ARRAY['branch_documents', 'file_path'],
    ARRAY['monthly_compliance_uploads', 'file_path'],
    ARRAY['crm_unit_documents', 'file_path'],
    ARRAY['safety_documents', 'file_path'],
    ARRAY['payroll_payslip_archives', 'file_path'],
    ARRAY['employee_documents', 'file_path'],
    ARRAY['payroll_fnf_documents', 'file_path'],
    ARRAY['invoices', 'pdf_path'],
    ARRAY['audit_resubmissions', 'file_path']
  ];
BEGIN
  FOREACH spec SLICE 1 IN ARRAY specs LOOP
    IF EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = spec[1]
         AND column_name = spec[2]
    ) THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I (%I)',
        'idx_' || spec[1] || '_' || spec[2] || '_lookup',
        spec[1],
        spec[2]
      );
    END IF;
  END LOOP;
END $$;
