-- Compatibility migration: create a view `branches` for legacy SQL that
-- still references the old table name. Safe no-op if `branches` already
-- exists. Depends on `client_branches` existing; if it doesn't, the view
-- won't be created (no destructive changes).

DO $$
BEGIN
  -- If a real table named "branches" exists, leave it alone.
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'branches' AND table_type = 'BASE TABLE') THEN
    RAISE NOTICE 'Table "branches" exists; no compatibility view created.';
    RETURN;
  END IF;

  -- If client_branches exists, create a compatibility view named branches
  -- that exposes the common legacy column names used by older queries.
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'client_branches' AND table_type = 'BASE TABLE') THEN
    EXECUTE '
      CREATE OR REPLACE VIEW branches AS
      SELECT
        client_branches.*,
        branchname AS branch_name,
        clientid AS client_id,
        statecode AS state,
        isactive AS is_active
      FROM client_branches
    ';
    RAISE NOTICE 'Created compatibility view "branches" -> client_branches.';
  ELSE
    RAISE NOTICE 'Neither "branches" nor "client_branches" found; compatibility view not created.';
  END IF;
END $$;
