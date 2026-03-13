-- Audit workflow: Document remarks, reupload requests, and version tracking
-- Supports Auditor → Contractor/Client reupload flow with visibility controls

BEGIN;

-- 1. Document remarks with visibility control
CREATE TABLE IF NOT EXISTS document_remarks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         bigint NOT NULL,  -- generic reference to any document table
  document_type       varchar(50) NOT NULL,  -- 'COMPLIANCE_EVIDENCE', 'CONTRACTOR_DOC', etc.
  created_by_role     varchar(20) NOT NULL,  -- 'AUDITOR', 'CRM'
  created_by_user_id  uuid NOT NULL REFERENCES users(id),
  visibility          varchar(30) NOT NULL DEFAULT 'INTERNAL',  -- 'INTERNAL', 'CLIENT_VISIBLE', 'CONTRACTOR_VISIBLE', 'BOTH_VISIBLE'
  text                text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_remarks_document ON document_remarks(document_id, document_type);
CREATE INDEX IF NOT EXISTS idx_doc_remarks_visibility ON document_remarks(visibility);
CREATE INDEX IF NOT EXISTS idx_doc_remarks_created_by ON document_remarks(created_by_user_id);

-- 2. Document reupload requests
CREATE TABLE IF NOT EXISTS document_reupload_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id           bigint NOT NULL,
  document_type         varchar(50) NOT NULL,
  client_id             uuid NOT NULL REFERENCES clients(id),
  unit_id               uuid NULL REFERENCES client_branches(id),
  contractor_id         uuid NULL REFERENCES users(id),  -- null if client doc
  
  target_role           varchar(20) NOT NULL,  -- 'CLIENT', 'CONTRACTOR'
  requested_by_role     varchar(20) NOT NULL,  -- 'AUDITOR', 'CRM'
  requested_by_user_id  uuid NOT NULL REFERENCES users(id),
  
  reason                varchar(200) NOT NULL,
  remarks_visible       text NOT NULL,  -- copy of visible remarks for history
  status                varchar(20) NOT NULL DEFAULT 'OPEN',  -- 'OPEN', 'SUBMITTED', 'REVERIFIED', 'REJECTED', 'CLOSED'
  
  deadline_date         date NULL,
  submitted_at          timestamptz NULL,
  reverified_at         timestamptz NULL,
  reverified_by_user_id uuid NULL REFERENCES users(id),
  crm_remarks           text NULL,
  
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reupload_req_target ON document_reupload_requests(target_role, contractor_id, client_id);
CREATE INDEX IF NOT EXISTS idx_reupload_req_status ON document_reupload_requests(status);
CREATE INDEX IF NOT EXISTS idx_reupload_req_requested_by ON document_reupload_requests(requested_by_user_id);
CREATE INDEX IF NOT EXISTS idx_reupload_req_doc ON document_reupload_requests(document_id, document_type);

-- 3. Document versions (preserve history on reupload)
CREATE TABLE IF NOT EXISTS document_versions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id           bigint NOT NULL,
  document_type         varchar(50) NOT NULL,
  version_no            int NOT NULL,
  
  file_path             text NOT NULL,
  file_name             varchar(255) NOT NULL,
  file_type             varchar(150) NULL,
  file_size             bigint NULL,
  
  uploaded_by_role      varchar(20) NOT NULL,  -- 'CLIENT', 'CONTRACTOR', 'CRM'
  uploaded_by_user_id   uuid NOT NULL REFERENCES users(id),
  reupload_request_id   uuid NULL REFERENCES document_reupload_requests(id),
  
  uploaded_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_versions_document ON document_versions(document_id, document_type);
CREATE INDEX IF NOT EXISTS idx_doc_versions_version ON document_versions(document_id, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_doc_versions_reupload ON document_versions(reupload_request_id);

COMMIT;
