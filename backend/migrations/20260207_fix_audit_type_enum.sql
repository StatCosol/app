-- Fix audit_type column: convert from enum to varchar so it accepts new values
-- (CONTRACTOR, FACTORY, SHOPS_ESTABLISHMENT, LABOUR_EMPLOYMENT, FSSAI, HR, PAYROLL)

DO $$
BEGIN
  -- Only convert if column still uses the enum type
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'audits' AND column_name = 'audit_type'
               AND udt_name = 'audit_type_enum') THEN
    ALTER TABLE audits ALTER COLUMN audit_type TYPE varchar(50) USING audit_type::text;
    RAISE NOTICE 'Converted audits.audit_type from enum to varchar(50)';
  ELSE
    RAISE NOTICE 'audits.audit_type is already varchar — no change needed';
  END IF;
END $$;

-- Also add missing columns if not present (from entity definition)
ALTER TABLE audits ADD COLUMN IF NOT EXISTS period_year        int NOT NULL DEFAULT 2026;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS period_code        varchar(20) NOT NULL DEFAULT '2026';
ALTER TABLE audits ADD COLUMN IF NOT EXISTS created_by_user_id uuid NULL;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS due_date           date NULL;

-- Rename auditor_user_id → assigned_auditor_id if needed
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'audits' AND column_name = 'auditor_user_id') THEN
    ALTER TABLE audits RENAME COLUMN auditor_user_id TO assigned_auditor_id;
    RAISE NOTICE 'Renamed auditor_user_id → assigned_auditor_id';
  ELSE
    RAISE NOTICE 'assigned_auditor_id already exists — no rename needed';
  END IF;
END $$;

-- Drop old columns not in entity
ALTER TABLE audits DROP COLUMN IF EXISTS branch_id;
ALTER TABLE audits DROP COLUMN IF EXISTS start_date;
ALTER TABLE audits DROP COLUMN IF EXISTS end_date;

-- Update status default
ALTER TABLE audits ALTER COLUMN status SET DEFAULT 'PLANNED';
ALTER TABLE audits ALTER COLUMN status TYPE varchar(20) USING left(status, 20);

-- Create audit_observation_categories if not exists
CREATE TABLE IF NOT EXISTS audit_observation_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        varchar(200) NOT NULL,
  description text NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_obs_cat_name
  ON audit_observation_categories(name);

-- Create audit_observations if not exists
CREATE TABLE IF NOT EXISTS audit_observations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id                uuid NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  category_id             uuid NULL REFERENCES audit_observation_categories(id) ON DELETE SET NULL,
  observation             text NOT NULL,
  consequences            text NULL,
  compliance_requirements text NULL,
  elaboration             text NULL,
  risk                    text NULL,
  evidence_file_paths     text[] NULL,
  status                  varchar(30) NOT NULL DEFAULT 'OPEN',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_obs_audit ON audit_observations(audit_id);
