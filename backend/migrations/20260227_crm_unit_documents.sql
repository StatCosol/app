-- Create / reconcile crm_unit_documents for CRM-uploaded company/branch documents.
-- This migration replaces the obsolete table-create script and must run before
-- 20260227_crm_unit_documents_deleted_by.sql on fresh databases.

CREATE TABLE IF NOT EXISTS crm_unit_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id),
  scope         VARCHAR(20) NOT NULL DEFAULT 'BRANCH',
  branch_id     UUID NULL REFERENCES client_branches(id),
  month         VARCHAR(7),
  law_category  VARCHAR(60) NOT NULL,
  document_type VARCHAR(60) NOT NULL,
  period_from   DATE,
  period_to     DATE,
  file_name     VARCHAR(500) NOT NULL,
  file_path     VARCHAR(1000) NOT NULL,
  mime_type     VARCHAR(120),
  file_size     BIGINT DEFAULT 0,
  uploaded_by   UUID NOT NULL REFERENCES users(id),
  remarks       TEXT,
  deleted_at    TIMESTAMPTZ,
  deleted_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'crm_unit_documents' AND column_name = 'unit_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'crm_unit_documents' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE crm_unit_documents RENAME COLUMN unit_id TO branch_id;
  END IF;
END$$;

ALTER TABLE crm_unit_documents
  ADD COLUMN IF NOT EXISTS scope VARCHAR(20) NOT NULL DEFAULT 'BRANCH',
  ADD COLUMN IF NOT EXISTS remarks TEXT,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE crm_unit_documents
  ALTER COLUMN branch_id DROP NOT NULL,
  ALTER COLUMN file_size TYPE BIGINT;

UPDATE crm_unit_documents
SET scope = CASE WHEN branch_id IS NULL THEN 'COMPANY' ELSE 'BRANCH' END
WHERE scope IS NULL
   OR scope NOT IN ('COMPANY', 'BRANCH');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'crm_unit_documents' AND column_name = 'uploaded_at'
  ) THEN
    EXECUTE $sql$
      UPDATE crm_unit_documents
         SET created_at = COALESCE(created_at, uploaded_at, NOW()),
             updated_at = COALESCE(updated_at, uploaded_at, NOW())
       WHERE created_at IS NULL OR updated_at IS NULL
    $sql$;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_crm_unit_documents_scope'
  ) THEN
    ALTER TABLE crm_unit_documents
      ADD CONSTRAINT chk_crm_unit_documents_scope
      CHECK (scope IN ('COMPANY', 'BRANCH'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_crm_unit_docs_client_month
  ON crm_unit_documents (client_id, month);

CREATE INDEX IF NOT EXISTS idx_crm_unit_docs_branch_month
  ON crm_unit_documents (branch_id, month);

CREATE INDEX IF NOT EXISTS idx_crm_unit_docs_client_branch_month
  ON crm_unit_documents (client_id, branch_id, month);

CREATE INDEX IF NOT EXISTS idx_crm_unit_docs_client_scope
  ON crm_unit_documents (client_id, scope);

CREATE INDEX IF NOT EXISTS idx_crm_unit_docs_not_deleted
  ON crm_unit_documents (deleted_at)
  WHERE deleted_at IS NULL;
