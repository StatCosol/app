-- Allow Contractor Portal worker deletion requests to use the shared
-- approval_requests workflow.

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname
    INTO constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
   WHERE nsp.nspname = 'public'
     AND rel.relname = 'approval_requests'
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) LIKE '%request_type%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE approval_requests DROP CONSTRAINT %I', constraint_name);
  END IF;

  ALTER TABLE approval_requests
    ADD CONSTRAINT approval_requests_request_type_check
    CHECK (
      request_type IN (
        'DELETE_BRANCH',
        'DELETE_CONTRACTOR',
        'DELETE_USER',
        'PAYROLL_FINALIZATION',
        'DELETE_CONTRACTOR_EMPLOYEE'
      )
    );
END $$;
