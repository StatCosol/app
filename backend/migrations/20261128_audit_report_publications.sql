-- New publications only: never reconstruct historical issued documents.
CREATE TABLE IF NOT EXISTS audit_report_publications (
  report_id uuid PRIMARY KEY REFERENCES audit_reports(id) ON DELETE RESTRICT,
  pdf bytea NOT NULL CHECK (octet_length(pdf)>0),
  sha256 text NOT NULL CHECK (length(sha256)=64),
  assessment_score numeric NULL,
  published_by uuid NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION protect_issued_audit_pdf() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Issued audit PDFs are immutable; publish a new revision';
END $$;
DROP TRIGGER IF EXISTS protect_issued_audit_pdf ON audit_report_publications;
CREATE TRIGGER protect_issued_audit_pdf BEFORE UPDATE OR DELETE ON audit_report_publications
FOR EACH ROW EXECUTE FUNCTION protect_issued_audit_pdf();

-- All writers, including older review endpoints, share the same audit lock as
-- report finalization/publication. Never move a finding to bypass the lock.
CREATE OR REPLACE FUNCTION guard_audit_observation_draft() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE aid uuid; audit_state text; report_state text; report_held timestamptz;
BEGIN
  IF TG_OP='UPDATE' AND NEW.audit_id IS DISTINCT FROM OLD.audit_id THEN
    RAISE EXCEPTION 'An observation cannot move between audits' USING ERRCODE='23514';
  END IF;
  aid := CASE WHEN TG_OP='DELETE' THEN OLD.audit_id ELSE NEW.audit_id END;
  SELECT status INTO audit_state FROM audits WHERE id=aid FOR UPDATE;
  SELECT status,held_at INTO report_state,report_held FROM audit_reports
    WHERE audit_id=aid ORDER BY updated_at DESC,created_at DESC LIMIT 1;
  IF (audit_state NOT IN ('PLANNED','IN_PROGRESS','CORRECTION_PENDING','REVERIFICATION_PENDING')
    AND NOT (audit_state='SUBMITTED' AND COALESCE(report_state,'')='DRAFT'))
    OR (report_state IS NOT NULL AND report_state<>'DRAFT') OR report_held IS NOT NULL THEN
    RAISE EXCEPTION 'Audit observations are read-only; reopen the audit/report first' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_audit_observation_draft ON audit_observations;
CREATE TRIGGER guard_audit_observation_draft BEFORE INSERT OR UPDATE OR DELETE ON audit_observations
FOR EACH ROW EXECUTE FUNCTION guard_audit_observation_draft();

-- Retain the first assessment for each submitted revision even if an older
-- application worker tries to overwrite it. Explicit re-audit resets it.
CREATE OR REPLACE FUNCTION preserve_submitted_audit_score() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.submitted_at IS NOT NULL AND NOT (
    OLD.status IN ('COMPLETED','CLOSED') AND NEW.status='IN_PROGRESS'
    AND NEW.submitted_at IS NULL AND NEW.score IS NULL
  ) THEN
    NEW.score := OLD.score;
    NEW.score_calculated_at := OLD.score_calculated_at;
    NEW.submitted_at := OLD.submitted_at;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS preserve_submitted_audit_score ON audits;
CREATE TRIGGER preserve_submitted_audit_score BEFORE UPDATE ON audits
FOR EACH ROW EXECUTE FUNCTION preserve_submitted_audit_score();
