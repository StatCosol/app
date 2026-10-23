-- Audit-specific evidence is append-only; a new upload invalidates the point review.
ALTER TABLE audit_checklist_items ADD COLUMN IF NOT EXISTS evidence_revision integer NOT NULL DEFAULT 0;
ALTER TABLE audit_checklist_items ADD COLUMN IF NOT EXISTS evidence_kind varchar(20) NOT NULL DEFAULT 'DOCUMENT';
CREATE TABLE IF NOT EXISTS audit_item_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 audit_id uuid NOT NULL REFERENCES audits(id),
 item_id uuid NOT NULL REFERENCES audit_checklist_items(id),
 file_name varchar(255) NOT NULL,
 stored_name varchar(255) NOT NULL UNIQUE,
 mime_type varchar(150) NOT NULL,
 file_size integer NOT NULL,
 description text NOT NULL,
 location varchar(250),
 uploaded_by uuid NOT NULL REFERENCES users(id),
 uploaded_role varchar(20) NOT NULL,
 revision integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_item_evidence_scope ON audit_item_evidence(audit_id,item_id,created_at);
CREATE TABLE IF NOT EXISTS audit_item_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 audit_id uuid NOT NULL REFERENCES audits(id),
 item_id uuid NOT NULL REFERENCES audit_checklist_items(id),
 decision varchar(30) NOT NULL,
 remarks text NOT NULL,
 evidence_revision integer NOT NULL,
 reviewed_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_item_reviews_scope ON audit_item_reviews(audit_id,item_id,created_at);

-- Serialize submission with evidence uploads. Reports cannot finalize while newly
-- submitted evidence remains unreviewed; closed audits cannot retain failed points.
CREATE OR REPLACE FUNCTION audit_fieldwork_closure_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id uuid;
BEGIN
 IF TG_TABLE_NAME='audits' THEN target_id := NEW.id; ELSE target_id := NEW.audit_id; END IF;
 IF NEW.status IN ('SUBMITTED','APPROVED','PUBLISHED','COMPLETED','CLOSED') THEN
  PERFORM id FROM audits WHERE id=target_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM audit_checklist_items WHERE audit_id=target_id) THEN
   IF EXISTS(SELECT 1 FROM audit_checklist_items WHERE audit_id=target_id AND (status IN ('PENDING','UPLOADED') OR (automated_remarks IS NOT NULL AND NOT automation_reviewed))) THEN
    RAISE EXCEPTION 'Review all audit evidence before submitting or finalizing' USING ERRCODE='23514';
   END IF;
   IF TG_TABLE_NAME='audits' AND NEW.status IN ('COMPLETED','CLOSED') AND EXISTS(SELECT 1 FROM audit_checklist_items WHERE audit_id=target_id AND status='NON_COMPLIED') THEN
    RAISE EXCEPTION 'Resolve audit point corrections before closing the audit' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_fieldwork_closure ON audits;
CREATE TRIGGER audit_fieldwork_closure BEFORE UPDATE OF status ON audits FOR EACH ROW EXECUTE FUNCTION audit_fieldwork_closure_guard();
DROP TRIGGER IF EXISTS audit_fieldwork_report_closure ON audit_reports;
CREATE TRIGGER audit_fieldwork_report_closure BEFORE INSERT OR UPDATE OF status ON audit_reports FOR EACH ROW EXECUTE FUNCTION audit_fieldwork_closure_guard();

-- A legacy document review loaded before a new upload must not restore the
-- older revision when its ORM entity is saved later.
CREATE OR REPLACE FUNCTION audit_evidence_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.evidence_revision < OLD.evidence_revision THEN
  RAISE EXCEPTION 'New audit evidence must be reviewed before changing this point' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_evidence_revision ON audit_checklist_items;
CREATE TRIGGER audit_evidence_revision BEFORE UPDATE ON audit_checklist_items FOR EACH ROW EXECUTE FUNCTION audit_evidence_revision_guard();
