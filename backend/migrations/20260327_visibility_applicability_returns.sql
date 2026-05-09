-- Migration: Visibility Layer, Applicability Engine, Returns Proofs, Expiry Tasks
-- Date: 2026-03-27

BEGIN;

-- ─── 1. audit_reports: add version + score columns ─────────────────────────
ALTER TABLE audit_reports
  ADD COLUMN IF NOT EXISTS version_no        INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS doc_score         INT,
  ADD COLUMN IF NOT EXISTS obs_score         INT,
  ADD COLUMN IF NOT EXISTS blended_score     INT,
  ADD COLUMN IF NOT EXISTS score_json        JSONB DEFAULT '{}';

-- ─── 2. client_branches: add special_flags_json ────────────────────────────
ALTER TABLE client_branches
  ADD COLUMN IF NOT EXISTS special_flags_json JSONB DEFAULT '{}';

-- ─── 3. branch_compliance_applicability ────────────────────────────────────
CREATE TABLE IF NOT EXISTS branch_compliance_applicability (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id        UUID NOT NULL REFERENCES client_branches(id) ON DELETE CASCADE,
  compliance_id    UUID NOT NULL,
  is_applicable    BOOLEAN NOT NULL DEFAULT true,
  reason           TEXT,
  evaluated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rule_id          UUID REFERENCES applicability_rule(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(branch_id, compliance_id)
);

CREATE INDEX IF NOT EXISTS idx_bca_branch ON branch_compliance_applicability(branch_id);
CREATE INDEX IF NOT EXISTS idx_bca_compliance ON branch_compliance_applicability(compliance_id);

-- ─── 4. return_task_proofs ─────────────────────────────────────────────────
CREATE TYPE return_proof_type AS ENUM ('ACK_RECEIPT', 'CHALLAN', 'SUPPORTING_DOC');

CREATE TABLE IF NOT EXISTS return_task_proofs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id        UUID NOT NULL REFERENCES compliance_returns(id) ON DELETE CASCADE,
  proof_type       return_proof_type NOT NULL DEFAULT 'ACK_RECEIPT',
  file_path        TEXT NOT NULL,
  file_name        TEXT NOT NULL,
  file_size        INT,
  mime_type        TEXT,
  uploaded_by      UUID,
  uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified         BOOLEAN DEFAULT false,
  verified_by      UUID,
  verified_at      TIMESTAMPTZ,
  remarks          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rtp_return ON return_task_proofs(return_id);

-- ─── 5. registration_expiry_tasks ──────────────────────────────────────────
CREATE TYPE expiry_task_status AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELLED');

CREATE TABLE IF NOT EXISTS registration_expiry_tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id     UUID NOT NULL REFERENCES branch_registrations(id) ON DELETE CASCADE,
  branch_id           UUID NOT NULL REFERENCES client_branches(id) ON DELETE CASCADE,
  client_id           UUID NOT NULL,
  registration_name   TEXT NOT NULL,
  expiry_date         DATE NOT NULL,
  days_before_expiry  INT NOT NULL DEFAULT 0,
  status              expiry_task_status NOT NULL DEFAULT 'PENDING',
  assigned_to         UUID,
  renewal_file_path   TEXT,
  renewal_date        DATE,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ret_branch ON registration_expiry_tasks(branch_id);
CREATE INDEX IF NOT EXISTS idx_ret_client ON registration_expiry_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_ret_status ON registration_expiry_tasks(status);
CREATE INDEX IF NOT EXISTS idx_ret_expiry ON registration_expiry_tasks(expiry_date);

COMMIT;
