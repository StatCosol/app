-- ============================================================
-- Migration: 20260221_employee_statutory_details.sql
-- Purpose:   Add employee_statutory table for PF/ESI extended
--            details needed by the ESS portal.
-- ============================================================

-- ── Table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_statutory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL,
  client_id     UUID NOT NULL,
  branch_id     UUID,

  -- PF
  pf_uan            VARCHAR(30),
  pf_member_id      VARCHAR(30),
  pf_join_date      DATE,
  pf_exit_date      DATE,
  pf_wages          NUMERIC(14,2),

  -- ESI
  esi_ip_number     VARCHAR(30),
  esi_dispensary    VARCHAR(200),
  esi_join_date     DATE,
  esi_exit_date     DATE,
  esi_wages         NUMERIC(14,2),

  -- PT
  pt_registration_number VARCHAR(60),

  -- LWF
  lwf_applicable    BOOLEAN DEFAULT FALSE,

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_statutory_employee_id
  ON employee_statutory (employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_statutory_client_id
  ON employee_statutory (client_id);

-- ── Seed from existing employees (auto-populate from employee master) ──
-- This INSERT copies existing uan/esic from employees table into
-- the new table so employees who already have data see it in ESS.
INSERT INTO employee_statutory (employee_id, client_id, branch_id, pf_uan, esi_ip_number)
SELECT e.id, e.client_id, e.branch_id, e.uan, e.esic
FROM employees e
WHERE e.uan IS NOT NULL OR e.esic IS NOT NULL
ON CONFLICT (employee_id) DO NOTHING;
