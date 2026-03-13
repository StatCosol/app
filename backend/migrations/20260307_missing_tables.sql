-- Migration: Create missing tables that have entities but no migration
-- Date: 2026-03-07
-- Tables: audit_logs, payroll_config_audit_logs, ai_usage_logs

-- ===================================================================
-- 1. audit_logs — general audit trail for entity changes
-- ===================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id            SERIAL PRIMARY KEY,
  entity_type   VARCHAR(50) NOT NULL,
  entity_id     UUID NOT NULL,
  action        VARCHAR(50) NOT NULL,
  performed_by  UUID,
  snapshot      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON audit_logs (entity_type, entity_id);

-- ===================================================================
-- 2. payroll_config_audit_logs — tracks payroll configuration changes
-- ===================================================================
CREATE TABLE IF NOT EXISTS payroll_config_audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL,
  user_id       UUID NOT NULL,
  action        VARCHAR(50) NOT NULL,
  entity_type   VARCHAR(100) NOT NULL,
  entity_id     UUID,
  old_values    JSONB,
  new_values    JSONB,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_config_audit_client_date
  ON payroll_config_audit_logs (client_id, created_at);

-- ===================================================================
-- 3. ai_usage_logs — tracks AI token usage and costs per client/month
-- ===================================================================
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID,
  user_id           UUID,
  module            VARCHAR(50) NOT NULL,
  month             VARCHAR(7) NOT NULL,
  prompt_tokens     INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  total_tokens      INT NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  model             VARCHAR(100),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_client_month
  ON ai_usage_logs (client_id, month);
