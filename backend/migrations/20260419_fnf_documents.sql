-- ============================================================
-- FnF Settlement Documents Repository
-- Stores uploaded settlement files (relieving letters,
-- settlement statements, experience certificates, Form 16,
-- no-dues certificates, etc.) linked to F&F cases.
-- ============================================================

CREATE TABLE IF NOT EXISTS payroll_fnf_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fnf_id        UUID NOT NULL REFERENCES payroll_fnf(id) ON DELETE CASCADE,
  client_id     UUID NOT NULL,
  employee_id   UUID NOT NULL,
  doc_type      VARCHAR(80)  NOT NULL,
  doc_name      VARCHAR(255) NOT NULL,
  file_name     VARCHAR(500) NOT NULL,
  file_path     VARCHAR(1000) NOT NULL,
  file_size     INT          NOT NULL DEFAULT 0,
  mime_type     VARCHAR(100),
  uploaded_by   UUID,
  remarks       TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fnf_docs_fnf_id ON payroll_fnf_documents(fnf_id);
CREATE INDEX IF NOT EXISTS idx_fnf_docs_client_emp ON payroll_fnf_documents(client_id, employee_id);
