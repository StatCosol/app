-- Migration: Add factory compliance fields to compliance_return_master
-- Date: 2026-03-21

-- Add new columns for factory compliance support
ALTER TABLE compliance_return_master
  ADD COLUMN IF NOT EXISTS state_code VARCHAR(20) NOT NULL DEFAULT 'ALL',
  ADD COLUMN IF NOT EXISTS applies_to VARCHAR(20) NOT NULL DEFAULT 'BRANCH',
  ADD COLUMN IF NOT EXISTS upload_required BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS due_date_rule VARCHAR(40),
  ADD COLUMN IF NOT EXISTS risk_level VARCHAR(10) NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS responsible_role VARCHAR(30) NOT NULL DEFAULT 'BRANCH_USER',
  ADD COLUMN IF NOT EXISTS remarks TEXT;

-- Index for state/applies_to filtering
CREATE INDEX IF NOT EXISTS idx_crm_state_applies
  ON compliance_return_master (state_code, applies_to, is_active);
