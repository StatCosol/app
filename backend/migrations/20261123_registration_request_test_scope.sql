-- Additive only: existing requests retain their actual classification and history.
ALTER TABLE helpdesk_tickets ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION protect_helpdesk_test_scope() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.is_test IS DISTINCT FROM OLD.is_test THEN
    RAISE EXCEPTION 'Request test classification is immutable';
  END IF;
  IF NEW.is_test AND (NEW.category <> 'COMPLIANCE' OR NEW.sub_category IS NULL OR
      NEW.sub_category NOT IN ('REGISTRATION_APPLY','REGISTRATION_AMEND','REGISTRATION_RENEW','REGISTRATION_CLOSE') OR NEW.branch_id IS NULL) THEN
    RAISE EXCEPTION 'Test requests require a registration action and branch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS helpdesk_test_scope_guard ON helpdesk_tickets;
CREATE TRIGGER helpdesk_test_scope_guard BEFORE INSERT OR UPDATE ON helpdesk_tickets
FOR EACH ROW EXECUTE FUNCTION protect_helpdesk_test_scope();
