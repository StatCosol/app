-- Migration: branch_applicable_compliances table
-- Date: 2026-02-10
-- Purpose: Add branch-level applicability mapping for compliances

BEGIN;

CREATE TABLE IF NOT EXISTS branch_applicable_compliances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES client_branches(id) ON DELETE CASCADE,
  compliance_id UUID NOT NULL REFERENCES compliance_master(id) ON DELETE CASCADE,
  is_applicable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_branch_applicable_compliances_branch_compliance
  ON branch_applicable_compliances(branch_id, compliance_id);

CREATE INDEX IF NOT EXISTS idx_branch_applicable_compliances_branch
  ON branch_applicable_compliances(branch_id);

CREATE INDEX IF NOT EXISTS idx_branch_applicable_compliances_compliance
  ON branch_applicable_compliances(compliance_id);

COMMIT;
