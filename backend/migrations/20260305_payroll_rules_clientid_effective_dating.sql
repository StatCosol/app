-- Migration: Add client_id and effective dating to payroll_component_rules and payroll_component_slabs
-- Date: 2026-03-05
-- Gaps addressed: #5 (clientId on rules/slabs) and #10 (effective dating on rules)

-- ── payroll_component_rules ──────────────────────────────────────
ALTER TABLE payroll_component_rules
  ADD COLUMN IF NOT EXISTS client_id UUID,
  ADD COLUMN IF NOT EXISTS effective_from DATE,
  ADD COLUMN IF NOT EXISTS effective_to DATE;

CREATE INDEX IF NOT EXISTS idx_pcr_client_id ON payroll_component_rules (client_id);

-- Backfill client_id from the parent component
UPDATE payroll_component_rules r
SET client_id = c.client_id
FROM payroll_components c
WHERE r.component_id = c.id
  AND r.client_id IS NULL;

-- ── payroll_component_slabs ──────────────────────────────────────
ALTER TABLE payroll_component_slabs
  ADD COLUMN IF NOT EXISTS client_id UUID;

CREATE INDEX IF NOT EXISTS idx_pcs_client_id ON payroll_component_slabs (client_id);

-- Backfill client_id from the parent rule → component chain
UPDATE payroll_component_slabs s
SET client_id = c.client_id
FROM payroll_component_rules r
JOIN payroll_components c ON r.component_id = c.id
WHERE s.rule_id = r.id
  AND s.client_id IS NULL;
