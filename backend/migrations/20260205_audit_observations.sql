-- Migration: Create audit_observations table for DTSS-style observations
-- Date: 2026-02-05
-- Purpose: Enable auditors to record structured observations with 4-part DTSS format

BEGIN;

-- Create audit_observations table
CREATE TABLE IF NOT EXISTS audit_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  category_id UUID REFERENCES audit_observation_categories(id) ON DELETE SET NULL,
  sequence_number INT,
  observation TEXT NOT NULL, -- What was observed
  consequences TEXT, -- What could happen
  compliance_requirements TEXT, -- What law/rule applies
  elaboration TEXT, -- Full explanation
  status VARCHAR(50) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CLOSED')),
  recorded_by_user_id UUID NOT NULL REFERENCES users(id),
  evidence_file_paths TEXT, -- JSON array of file paths
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_audit_obs_auditid ON audit_observations(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_obs_category ON audit_observations(category_id);
CREATE INDEX IF NOT EXISTS idx_audit_obs_status ON audit_observations(status);
CREATE INDEX IF NOT EXISTS idx_audit_obs_recordedby ON audit_observations(recorded_by_user_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_audit_observations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_audit_observations_updated_at ON audit_observations;

CREATE TRIGGER trigger_update_audit_observations_updated_at
BEFORE UPDATE ON audit_observations
FOR EACH ROW
EXECUTE FUNCTION update_audit_observations_updated_at();

COMMIT;
