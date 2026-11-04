-- Versioned statutory checklist sessions. The catalogue is shipped with the application.
CREATE TABLE IF NOT EXISTS audit_entry_sessions (
  audit_id uuid PRIMARY KEY REFERENCES audits(id) ON DELETE CASCADE,
  catalogue_version text NOT NULL,
  unit_type text NOT NULL CHECK (unit_type IN ('FACTORY','FACTORY_VENDOR','SHOPS_ESTABLISHMENT','SHOPS_VENDOR','WAREHOUSE','WAREHOUSE_VENDOR')),
  auditee_name varchar(200) NOT NULL,
  categories jsonb NOT NULL,
  scope_acknowledged boolean NOT NULL DEFAULT false,
  audit_mode text NOT NULL DEFAULT 'PHYSICAL' CHECK (audit_mode IN ('PHYSICAL','ONLINE')),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_entry_answers (
  audit_id uuid NOT NULL REFERENCES audit_entry_sessions(audit_id) ON DELETE CASCADE,
  item_id text NOT NULL,
  answer text NOT NULL,
  status text NOT NULL CHECK (status IN ('COMPLIED','NON_COMPLIED','NOT_APPLICABLE')),
  remarks text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  document_token text NOT NULL DEFAULT '',
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (audit_id,item_id)
);
CREATE TABLE IF NOT EXISTS audit_entry_evidence (
  audit_id uuid NOT NULL REFERENCES audit_entry_sessions(audit_id) ON DELETE CASCADE,
  item_id text NOT NULL,
  filename varchar(200) NOT NULL,
  mime_type text NOT NULL,
  content bytea NOT NULL CHECK (octet_length(content) <= 5242880),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (audit_id,item_id)
);
ALTER TABLE audit_non_compliances ADD COLUMN IF NOT EXISTS entry_item_id text;
CREATE UNIQUE INDEX IF NOT EXISTS audit_nc_entry_item_unique
  ON audit_non_compliances(audit_id,entry_item_id) WHERE entry_item_id IS NOT NULL;

-- Auditee documents are separate from the auditor's inspection snapshots.
-- Every re-upload creates a new immutable version, retaining the prior evidence.
CREATE TABLE IF NOT EXISTS audit_entry_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES audit_entry_sessions(audit_id) ON DELETE CASCADE,
  item_id text NOT NULL,
  revision integer NOT NULL,
  filename varchar(200) NOT NULL,
  mime_type text NOT NULL,
  content bytea NOT NULL CHECK (octet_length(content) <= 10485760),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  review_status text NOT NULL DEFAULT 'PENDING' CHECK (review_status IN ('PENDING','APPROVED','REJECTED')),
  review_remarks text NOT NULL DEFAULT '',
  review_version integer NOT NULL DEFAULT 0,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  UNIQUE(audit_id,item_id,revision)
);

-- Statutory sessions must be submitted before any legacy path can finalize an audit/report.
-- Existing fieldwork and report approval guards remain in force.
CREATE OR REPLACE FUNCTION audit_statutory_closure_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id uuid;
BEGIN
 IF TG_TABLE_NAME='audits' THEN target_id := NEW.id; ELSE target_id := NEW.audit_id; END IF;
 IF NEW.status IN ('SUBMITTED','APPROVED','PUBLISHED','COMPLETED','CLOSED') THEN
  PERFORM id FROM audits WHERE id=target_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM audit_entry_sessions WHERE audit_id=target_id AND submitted_at IS NULL) THEN
   RAISE EXCEPTION 'Submit the statutory checklist before finalizing this audit or report' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_statutory_closure ON audits;
CREATE TRIGGER audit_statutory_closure BEFORE UPDATE OF status ON audits FOR EACH ROW EXECUTE FUNCTION audit_statutory_closure_guard();
DROP TRIGGER IF EXISTS audit_statutory_report_closure ON audit_reports;
CREATE TRIGGER audit_statutory_report_closure BEFORE INSERT OR UPDATE OF status ON audit_reports FOR EACH ROW EXECUTE FUNCTION audit_statutory_closure_guard();
