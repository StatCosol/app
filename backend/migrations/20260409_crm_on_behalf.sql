-- CRM "Acting on Behalf" feature — Managed Compliance Service Mode
-- Adds per-client config flag and on-behalf tracking columns to document tables

-- 1. Client config flag
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS crm_on_behalf_enabled BOOLEAN DEFAULT false;

-- 2. compliance_documents: on-behalf tracking
ALTER TABLE compliance_documents
  ADD COLUMN IF NOT EXISTS uploaded_by_role       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS acting_on_behalf        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_owner_role     VARCHAR(20);

-- 3. branch_documents: on-behalf tracking
ALTER TABLE branch_documents
  ADD COLUMN IF NOT EXISTS uploaded_by_role       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS acting_on_behalf        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_owner_role     VARCHAR(20);

-- 4. contractor_documents: on-behalf tracking
ALTER TABLE contractor_documents
  ADD COLUMN IF NOT EXISTS uploaded_by_role       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS acting_on_behalf        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_owner_role     VARCHAR(20);

-- 5. crm_unit_documents: on-behalf tracking
ALTER TABLE crm_unit_documents
  ADD COLUMN IF NOT EXISTS uploaded_by_role       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS acting_on_behalf        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_owner_role     VARCHAR(20);

-- 6. compliance_returns: on-behalf tracking
ALTER TABLE compliance_returns
  ADD COLUMN IF NOT EXISTS uploaded_by_role       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS acting_on_behalf        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_owner_role     VARCHAR(20);

-- Indexes for dashboard KPI queries
CREATE INDEX IF NOT EXISTS idx_cd_acting_on_behalf ON compliance_documents (acting_on_behalf) WHERE acting_on_behalf = true;
CREATE INDEX IF NOT EXISTS idx_bd_acting_on_behalf ON branch_documents (acting_on_behalf) WHERE acting_on_behalf = true;
CREATE INDEX IF NOT EXISTS idx_cr_acting_on_behalf ON compliance_returns (acting_on_behalf) WHERE acting_on_behalf = true;
