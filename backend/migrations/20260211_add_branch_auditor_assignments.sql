-- Add branch-wise auditor assignment support (multiple auditors per client)
-- Date: 2026-02-11
BEGIN;

CREATE TABLE IF NOT EXISTS branch_auditor_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  branch_id        UUID NOT NULL REFERENCES client_branches(id) ON DELETE CASCADE,
  auditor_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  start_date       TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_date         TIMESTAMPTZ,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active auditor per branch at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_branch_auditor_active
  ON branch_auditor_assignments(branch_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_branch_auditor_client_active
  ON branch_auditor_assignments(client_id, is_active);

CREATE INDEX IF NOT EXISTS idx_branch_auditor_auditor_active
  ON branch_auditor_assignments(auditor_user_id, is_active);

COMMIT;
