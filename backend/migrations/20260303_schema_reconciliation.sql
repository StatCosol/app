-- =============================================================================
-- Migration: 20260303_schema_reconciliation.sql
-- Purpose:   Fix 5 schema mismatches found during entity-vs-schema audit
-- Date:      2026-03-03
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- MISMATCH 1: audit_observations — missing 'clause' and 'recommendation' columns
-- Entity audit-observation.entity.ts defines these columns, but the
-- 20260212_CRITICAL_FIXES.sql migration dropped + recreated the table without them.
-- ---------------------------------------------------------------------------
ALTER TABLE audit_observations
  ADD COLUMN IF NOT EXISTS clause VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recommendation TEXT DEFAULT NULL;

-- Also widen 'status' from VARCHAR(30) → VARCHAR(50) to match entity definition
ALTER TABLE audit_observations
  ALTER COLUMN status TYPE VARCHAR(50);


-- ---------------------------------------------------------------------------
-- MISMATCH 2: payroll_component_master — table does not exist
-- Entity payroll-component-master.entity.ts references this table, but no
-- migration ever created it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_component_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  component_type VARCHAR(30) NOT NULL DEFAULT 'EARNING',
  is_taxable BOOLEAN NOT NULL DEFAULT false,
  affects_pf_wage BOOLEAN NOT NULL DEFAULT false,
  affects_esi_wage BOOLEAN NOT NULL DEFAULT false,
  default_formula TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_component_master_code
  ON payroll_component_master(code);


-- ---------------------------------------------------------------------------
-- MISMATCH 3: payroll_client_component_overrides — table does not exist
-- Entity payroll-client-component-override.entity.ts references this table,
-- but no migration ever created it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_client_component_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  component_id UUID NOT NULL,
  enabled BOOLEAN DEFAULT NULL,
  display_order INT DEFAULT NULL,
  show_on_payslip BOOLEAN DEFAULT NULL,
  label_override VARCHAR(200) DEFAULT NULL,
  formula_override TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_pcco_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_pcco_component
    FOREIGN KEY (component_id) REFERENCES payroll_component_master(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pcco_client_component
  ON payroll_client_component_overrides(client_id, component_id);

CREATE INDEX IF NOT EXISTS idx_pcco_client
  ON payroll_client_component_overrides(client_id);

CREATE INDEX IF NOT EXISTS idx_pcco_component
  ON payroll_client_component_overrides(component_id);


-- ---------------------------------------------------------------------------
-- MISMATCH 4: payroll_templates — missing file_name, file_path, file_type columns
-- Entity payroll-template.entity.ts defines these columns, but
-- 20260203_payroll_templates_and_settings.sql only created id/name/version/is_active.
-- ---------------------------------------------------------------------------
ALTER TABLE payroll_templates
  ADD COLUMN IF NOT EXISTS file_name VARCHAR(300) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS file_path TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS file_type VARCHAR(150) DEFAULT NULL;


-- ---------------------------------------------------------------------------
-- WARNING FIX: clients.client_code — widen from VARCHAR(20) to VARCHAR(30)
-- Entity client.entity.ts defines length 30, but statco_schema_final.sql
-- created it as VARCHAR(20).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients'
      AND column_name = 'client_code'
      AND character_maximum_length < 30
  ) THEN
    ALTER TABLE clients ALTER COLUMN client_code TYPE VARCHAR(30);
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- Updated_at trigger for payroll_component_master
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_payroll_component_master_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_pcm_updated_at ON payroll_component_master;
CREATE TRIGGER trigger_pcm_updated_at
  BEFORE UPDATE ON payroll_component_master
  FOR EACH ROW EXECUTE FUNCTION update_payroll_component_master_updated_at();


-- ---------------------------------------------------------------------------
-- Updated_at trigger for payroll_client_component_overrides
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_pcco_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_pcco_updated_at ON payroll_client_component_overrides;
CREATE TRIGGER trigger_pcco_updated_at
  BEFORE UPDATE ON payroll_client_component_overrides
  FOR EACH ROW EXECUTE FUNCTION update_pcco_updated_at();

COMMIT;
