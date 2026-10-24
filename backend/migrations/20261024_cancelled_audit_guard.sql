-- A stale start/reassign request must not revive an audit cancelled by CRM.
CREATE OR REPLACE FUNCTION guard_cancelled_audit_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'CANCELLED' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'This audit has been cancelled. Create a new schedule instead.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cancelled_audit_status ON audits;
CREATE TRIGGER cancelled_audit_status BEFORE UPDATE OF status ON audits
  FOR EACH ROW EXECUTE FUNCTION guard_cancelled_audit_status();
DROP TRIGGER IF EXISTS cancelled_audit_schedule_status ON audit_schedules;
CREATE TRIGGER cancelled_audit_schedule_status BEFORE UPDATE OF status ON audit_schedules
  FOR EACH ROW EXECUTE FUNCTION guard_cancelled_audit_status();

-- Backstop for any report transition path: lock the same parent row as CRM
-- cancellation and recheck its state after a competing transaction commits.
CREATE OR REPLACE FUNCTION guard_cancelled_audit_report() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE audit_status text;
BEGIN
  IF NEW.status IN ('SUBMITTED', 'APPROVED', 'PUBLISHED') THEN
    SELECT status INTO audit_status FROM audits WHERE id=NEW.audit_id FOR UPDATE;
    IF audit_status = 'CANCELLED' THEN
      RAISE EXCEPTION 'Cannot submit or publish a report for a cancelled audit' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cancelled_audit_report ON audit_reports;
CREATE TRIGGER cancelled_audit_report BEFORE INSERT OR UPDATE OF status ON audit_reports
  FOR EACH ROW EXECUTE FUNCTION guard_cancelled_audit_report();
