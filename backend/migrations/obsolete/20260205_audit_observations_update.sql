-- Migration: Update audit_observations for DTSS format
-- Date: 2026-02-05
-- Purpose: Add DTSS fields to existing audit_observations table

BEGIN;

-- Add DTSS format columns if they don't exist
ALTER TABLE audit_observations 
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES audit_observation_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sequence_number INT,
  ADD COLUMN IF NOT EXISTS observation TEXT,
  ADD COLUMN IF NOT EXISTS consequences TEXT,
  ADD COLUMN IF NOT EXISTS compliance_requirements TEXT,
  ADD COLUMN IF NOT EXISTS elaboration TEXT,
  ADD COLUMN IF NOT EXISTS recorded_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS evidence_file_paths TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Migrate existing data to new format (if any rows exist)
UPDATE audit_observations 
SET 
  observation = COALESCE(title, ''),
  consequences = '',
  compliance_requirements = COALESCE(applicable_law, ''),
  elaboration = COALESCE(description, ''),
  recorded_by_user_id = COALESCE(created_by_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
WHERE observation IS NULL;

-- Make observation and recorded_by_user_id NOT NULL after migration
ALTER TABLE audit_observations 
  ALTER COLUMN observation SET NOT NULL,
  ALTER COLUMN recorded_by_user_id SET NOT NULL;

-- Create missing indexes
CREATE INDEX IF NOT EXISTS idx_audit_obs_category ON audit_observations(category_id);
CREATE INDEX IF NOT EXISTS idx_audit_obs_recordedby ON audit_observations(recorded_by_user_id);

-- Create/update trigger for updated_at
DROP TRIGGER IF EXISTS trigger_update_audit_observations_updated_at ON audit_observations;

CREATE OR REPLACE FUNCTION update_audit_observations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_audit_observations_updated_at
BEFORE UPDATE ON audit_observations
FOR EACH ROW
EXECUTE FUNCTION update_audit_observations_updated_at();

COMMIT;
