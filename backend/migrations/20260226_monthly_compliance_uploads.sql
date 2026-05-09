-- Migration: Create monthly_compliance_uploads table
-- Date: 2026-02-26
-- Purpose: Store monthly compliance document uploads (MCD + Returns)

CREATE TABLE IF NOT EXISTS monthly_compliance_uploads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID        NOT NULL,
  branch_id     UUID        NOT NULL,
  month         VARCHAR(7)  NOT NULL,        -- YYYY-MM
  code          VARCHAR(100) NOT NULL,       -- compliance item code
  file_name     VARCHAR(255) NOT NULL,
  file_path     TEXT         NOT NULL,
  file_size     BIGINT       NOT NULL DEFAULT 0,
  mime_type     VARCHAR(120),
  uploaded_by   UUID         NOT NULL,
  is_deleted    BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mcu_branch_month
  ON monthly_compliance_uploads (branch_id, month);

CREATE INDEX IF NOT EXISTS idx_mcu_branch_month_code
  ON monthly_compliance_uploads (branch_id, month, code);

CREATE INDEX IF NOT EXISTS idx_mcu_client
  ON monthly_compliance_uploads (client_id);

COMMENT ON TABLE monthly_compliance_uploads IS 'Monthly compliance document uploads (MCD & Returns) from the unified Monthly Uploads page';
