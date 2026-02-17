-- Migration: Create audit_observation_categories table
-- Date: 2026-02-05
-- Purpose: Add master table for audit observation categorization

BEGIN;

-- Create audit_observation_categories table
CREATE TABLE IF NOT EXISTS audit_observation_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create unique index on name
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_obs_cat_name ON audit_observation_categories(name);

-- Seed default categories (DTSS standard categories)
INSERT INTO audit_observation_categories (name, description) VALUES
  ('Non-Compliance', 'Failure to comply with statutory requirements'),
  ('Documentation Gap', 'Missing or incomplete required documentation'),
  ('Process Deficiency', 'Inadequate or ineffective processes'),
  ('Training Gap', 'Insufficient employee training or awareness'),
  ('Risk Exposure', 'Identified areas of potential legal or operational risk'),
  ('Best Practice Recommendation', 'Opportunities for improvement beyond compliance')
ON CONFLICT (name) DO NOTHING;

COMMIT;
