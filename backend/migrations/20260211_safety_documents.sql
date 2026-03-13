-- Migration: Create safety_documents table
-- Date: 2026-02-11
-- Purpose: Store factory/establishment safety-related documents
--          uploaded by branch users, visible to client users and CRM.

CREATE TABLE IF NOT EXISTS safety_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id       UUID NOT NULL REFERENCES client_branches(id),
  client_id       UUID NOT NULL REFERENCES clients(id),
  document_type   VARCHAR(100) NOT NULL,
  document_name   VARCHAR(255) NOT NULL,
  file_name       VARCHAR(500) NOT NULL,
  file_path       VARCHAR(1000) NOT NULL,
  mime_type       VARCHAR(100),
  file_size       BIGINT,
  valid_from      DATE,
  valid_to        DATE,
  status          VARCHAR(30) DEFAULT 'ACTIVE',
  remarks         TEXT,
  uploaded_by     UUID NOT NULL REFERENCES users(id),
  is_deleted      BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_safety_docs_branch
  ON safety_documents(branch_id)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_safety_docs_client
  ON safety_documents(client_id)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_safety_docs_expiry
  ON safety_documents(valid_to)
  WHERE valid_to IS NOT NULL AND is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_safety_docs_uploaded_by
  ON safety_documents(uploaded_by);

COMMENT ON TABLE safety_documents IS 'Factory/establishment safety documents uploaded by branch users';
