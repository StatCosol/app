-- Migration: Create crm_unit_documents table
-- CRM uploads unit-specific documents (returns, receipts, challans, acknowledgements)
-- Visible to: CRM (assigned), Master Client (all units), Branch User (own unit only)

CREATE TABLE IF NOT EXISTS crm_unit_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id),
  unit_id       UUID NOT NULL REFERENCES client_branches(id),
  month         VARCHAR(7),                               -- YYYY-MM format
  law_category  VARCHAR(60) NOT NULL,                     -- PF / ESI / PT / FACTORY / CLRA / OTHER
  document_type VARCHAR(60) NOT NULL,                     -- Return / Receipt / Challan / Acknowledgement / Other
  period_from   DATE,
  period_to     DATE,
  file_name     VARCHAR(255) NOT NULL,
  file_path     TEXT NOT NULL,
  mime_type     VARCHAR(120),
  file_size     BIGINT DEFAULT 0,
  uploaded_by   UUID NOT NULL REFERENCES users(id),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,
  deleted_by    UUID REFERENCES users(id)
);

-- Performance indexes for 50+ clients
CREATE INDEX IF NOT EXISTS idx_crm_unit_docs_client_month
  ON crm_unit_documents (client_id, month);

CREATE INDEX IF NOT EXISTS idx_crm_unit_docs_unit_month
  ON crm_unit_documents (unit_id, month);

CREATE INDEX IF NOT EXISTS idx_crm_unit_docs_client_unit_month
  ON crm_unit_documents (client_id, unit_id, month);

CREATE INDEX IF NOT EXISTS idx_crm_unit_docs_not_deleted
  ON crm_unit_documents (deleted_at)
  WHERE deleted_at IS NULL;
