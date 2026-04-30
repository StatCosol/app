-- Preflight reconciliation to ensure legacy baseline schema is compatible
-- with newer migrations that depend on client_branches.

BEGIN;

-- Rename baseline branches table to canonical client_branches name.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'branches')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'client_branches') THEN
    ALTER TABLE branches RENAME TO client_branches;
  END IF;
END $$;

-- Align column names expected by entities and migrations.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_branches' AND column_name = 'client_id') THEN
    ALTER TABLE client_branches RENAME COLUMN client_id TO clientid;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_branches' AND column_name = 'branch_name') THEN
    ALTER TABLE client_branches RENAME COLUMN branch_name TO branchname;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_branches' AND column_name = 'branch_type') THEN
    ALTER TABLE client_branches RENAME COLUMN branch_type TO branchtype;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_branches' AND column_name = 'is_active') THEN
    ALTER TABLE client_branches RENAME COLUMN is_active TO isactive;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_branches' AND column_name = 'deleted_at') THEN
    ALTER TABLE client_branches RENAME COLUMN deleted_at TO deletedat;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_branches' AND column_name = 'created_at') THEN
    ALTER TABLE client_branches RENAME COLUMN created_at TO createdat;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_branches' AND column_name = 'updated_at') THEN
    ALTER TABLE client_branches RENAME COLUMN updated_at TO updatedat;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_branches' AND column_name = 'state') THEN
    ALTER TABLE client_branches RENAME COLUMN state TO statecode;
  END IF;
END $$;

-- Normalize types and constraints used by subsequent migrations.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'client_branches'
      AND column_name = 'branchtype'
      AND udt_name = 'branch_type_enum'
  ) THEN
    ALTER TABLE client_branches ALTER COLUMN branchtype TYPE varchar USING branchtype::text;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'client_branches'
      AND column_name = 'statecode'
      AND data_type = 'character varying'
  ) THEN
    ALTER TABLE client_branches ALTER COLUMN statecode TYPE varchar(10) USING left(statecode, 10);
  END IF;
END $$;

ALTER TABLE client_branches ALTER COLUMN branchname DROP NOT NULL;
UPDATE client_branches SET address = '' WHERE address IS NULL;
ALTER TABLE client_branches ALTER COLUMN address SET NOT NULL;

ALTER TABLE client_branches ADD COLUMN IF NOT EXISTS headcount int NOT NULL DEFAULT 0;
ALTER TABLE client_branches ADD COLUMN IF NOT EXISTS employeecount int NOT NULL DEFAULT 0;
ALTER TABLE client_branches ADD COLUMN IF NOT EXISTS contractorcount int NOT NULL DEFAULT 0;
ALTER TABLE client_branches ADD COLUMN IF NOT EXISTS status varchar NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE client_branches ADD COLUMN IF NOT EXISTS isdeleted boolean NOT NULL DEFAULT false;
ALTER TABLE client_branches ADD COLUMN IF NOT EXISTS deletedby uuid NULL;
ALTER TABLE client_branches ADD COLUMN IF NOT EXISTS deletereason text NULL;
ALTER TABLE client_branches ADD COLUMN IF NOT EXISTS establishment_type varchar(30) NOT NULL DEFAULT 'BRANCH';

CREATE INDEX IF NOT EXISTS idx_client_branches_clientid ON client_branches(clientid);

COMMIT;