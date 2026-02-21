-- ============================================================
-- Payroll Statutory Services Refactor: State-aware PT/LWF slabs
-- 2026-02-18
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Payroll Statutory Slabs (state-aware PT / LWF)
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll_statutory_slabs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id),
  state_code      VARCHAR(10) NOT NULL DEFAULT 'ALL',
  component_code  VARCHAR(30) NOT NULL,
  from_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  to_amount       NUMERIC(14,2),
  value_amount    NUMERIC(14,2),
  value_percent   NUMERIC(10,4),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_stat_slab_client_state_comp
  ON payroll_statutory_slabs (client_id, state_code, component_code);

COMMIT;
