-- Audit checklist items: defines required documents / items per audit
-- Each audit can have a checklist of items that the auditor verifies

CREATE TABLE IF NOT EXISTS audit_checklist_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id      UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  item_label    VARCHAR(255) NOT NULL,          -- e.g. "PF Challan", "Factory License", "ESI Return"
  doc_type      VARCHAR(100),                   -- doc_type to match against uploaded documents
  is_required   BOOLEAN NOT NULL DEFAULT TRUE,
  status        VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    -- PENDING: not yet verified
    -- UPLOADED: document found / linked
    -- COMPLIED: auditor marked complied
    -- NON_COMPLIED: auditor marked non-complied
    -- NOT_APPLICABLE: not applicable for this audit
  linked_doc_id UUID,                           -- FK to the actual document (branch_documents or contractor_documents)
  linked_doc_table VARCHAR(30),                 -- 'branch_documents' or 'contractor_documents'
  remarks       TEXT,
  reviewed_by   UUID REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_checklist_audit ON audit_checklist_items(audit_id);
CREATE INDEX idx_checklist_status ON audit_checklist_items(status);

-- Constraint to validate status values
ALTER TABLE audit_checklist_items
  ADD CONSTRAINT chk_checklist_status
  CHECK (status IN ('PENDING','UPLOADED','COMPLIED','NON_COMPLIED','NOT_APPLICABLE'));
