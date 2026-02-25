-- ============================================================
-- Branch Desk Wiring Migration
-- Date: 2026-02-24
-- Purpose: New table for registration tracking + indexes for
--          branch-scoped queries on existing tables
-- ============================================================

BEGIN;

-- ─── 1. Branch Registrations Table ─────────────────────────
-- Tracks registrations, licenses, certificates per branch
-- with expiry tracking (separate from branch_documents which
-- stores uploaded files)
CREATE TABLE IF NOT EXISTS branch_registrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL,
  branch_id       UUID NOT NULL,
  type            VARCHAR(200) NOT NULL,           -- e.g. 'Shops & Establishment Act'
  registration_number VARCHAR(100),                -- e.g. 'S&E/2024/001234'
  authority       VARCHAR(200),                    -- issuing authority name
  issued_date     DATE,
  expiry_date     DATE,                            -- NULL = no expiry
  status          VARCHAR(30) DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE','EXPIRING_SOON','EXPIRED','SUSPENDED','PENDING')),
  document_path   TEXT,                            -- link to uploaded certificate
  remarks         TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_br_branch ON branch_registrations(branch_id);
CREATE INDEX IF NOT EXISTS idx_br_client ON branch_registrations(client_id);
CREATE INDEX IF NOT EXISTS idx_br_status ON branch_registrations(status);
CREATE INDEX IF NOT EXISTS idx_br_expiry ON branch_registrations(expiry_date)
  WHERE expiry_date IS NOT NULL;

COMMENT ON TABLE branch_registrations IS
  'Branch-level registration/license tracking with expiry dates. '
  'Status is auto-computed by the application based on expiry_date.';

-- ─── 2. Helpdesk: Index for branch-scoped queries ──────────
CREATE INDEX IF NOT EXISTS idx_ht_branch
  ON helpdesk_tickets(branch_id)
  WHERE branch_id IS NOT NULL;

-- ─── 3. Audit observations: index for branch join queries ──
CREATE INDEX IF NOT EXISTS idx_ao_audit_id
  ON audit_observations(audit_id);

CREATE INDEX IF NOT EXISTS idx_audits_branch
  ON audits(branch_id)
  WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audits_client_branch
  ON audits(client_id, branch_id);

COMMIT;
