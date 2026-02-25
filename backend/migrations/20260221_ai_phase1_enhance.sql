-- ============================================================
-- AI Request/Response Logging + Audits branch_id  (Phase-1 enhancement)
-- Run AFTER 20260221_ai_module_schema.sql
-- ============================================================

-- 1) ai_requests — logs every AI call for auditability
CREATE TABLE IF NOT EXISTS ai_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NULL,
  module        VARCHAR(50)  NOT NULL DEFAULT 'GENERAL',  -- COMPLIANCE / AUDIT / DOCUMENT / QUERY / RISK
  entity_type   VARCHAR(50)  NULL,                        -- BRANCH / CONTRACTOR / EMPLOYEE / NOTICE / DOC
  entity_id     UUID NULL,
  request_payload JSONB NOT NULL DEFAULT '{}',
  status        VARCHAR(20)  NOT NULL DEFAULT 'PENDING',  -- PENDING / RUNNING / DONE / FAILED
  created_by    UUID NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_requests_status    ON ai_requests(status);
CREATE INDEX IF NOT EXISTS idx_ai_requests_module    ON ai_requests(module);
CREATE INDEX IF NOT EXISTS idx_ai_requests_entity    ON ai_requests(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ai_requests_created   ON ai_requests(created_at DESC);

-- 2) ai_responses — linked to ai_requests
CREATE TABLE IF NOT EXISTS ai_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_request_id   UUID NOT NULL REFERENCES ai_requests(id) ON DELETE CASCADE,
  response_text   TEXT NULL,
  response_json   JSONB NOT NULL DEFAULT '{}',
  confidence      NUMERIC(5,4) NULL,                     -- 0.0000–1.0000
  tokens_used     INT NULL,
  model           VARCHAR(100) NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_responses_request ON ai_responses(ai_request_id);

-- 3) ai_document_checks — focused doc-check results
CREATE TABLE IF NOT EXISTS ai_document_checks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NULL,
  client_id       UUID NULL,
  branch_id       UUID NULL,
  document_type   VARCHAR(100) NULL,
  document_name   VARCHAR(500) NULL,
  issues          JSONB NOT NULL DEFAULT '[]',
  result          VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PASS / WARN / FAIL / PENDING
  suggested_fix   JSONB NOT NULL DEFAULT '[]',
  ai_request_id   UUID NULL REFERENCES ai_requests(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_doc_checks_doc    ON ai_document_checks(document_id);
CREATE INDEX IF NOT EXISTS idx_ai_doc_checks_client ON ai_document_checks(client_id);

-- 4) Add branch_id to audits table (enables branch-wise audit KPIs)
ALTER TABLE audits ADD COLUMN IF NOT EXISTS branch_id UUID NULL;
CREATE INDEX IF NOT EXISTS idx_audits_branch_id ON audits(branch_id);

-- Note: We skip foreign key constraint to avoid issues if branches table uses different naming.
-- If needed, run:  ALTER TABLE audits ADD CONSTRAINT fk_audits_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

-- Done
