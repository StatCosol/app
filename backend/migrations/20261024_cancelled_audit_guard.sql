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
