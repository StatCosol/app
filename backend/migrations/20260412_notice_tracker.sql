-- ================================================
-- Notice Tracker Tables
-- ================================================

CREATE TABLE IF NOT EXISTS notices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_code   VARCHAR(30)  NOT NULL UNIQUE,
  client_id     UUID         NOT NULL REFERENCES clients(id),
  branch_id     UUID                  REFERENCES client_branches(id),
  notice_type   VARCHAR(30)  NOT NULL DEFAULT 'GENERAL',
  department_name VARCHAR(150) NOT NULL,
  reference_no  VARCHAR(100),
  subject       VARCHAR(255) NOT NULL,
  description   TEXT,
  notice_date   DATE         NOT NULL,
  received_date DATE         NOT NULL,
  response_due_date DATE,
  severity      VARCHAR(30)  NOT NULL DEFAULT 'MEDIUM',
  status        VARCHAR(30)  NOT NULL DEFAULT 'RECEIVED',
  assigned_to_user_id UUID   REFERENCES users(id),
  linked_compliance_instance_id UUID,
  response_summary TEXT,
  response_date DATE,
  closure_remarks TEXT,
  closed_at     TIMESTAMPTZ,
  closed_by_user_id UUID     REFERENCES users(id),
  created_by_user_id UUID    NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notice_client ON notices(client_id);
CREATE INDEX IF NOT EXISTS idx_notice_branch ON notices(branch_id);
CREATE INDEX IF NOT EXISTS idx_notice_status ON notices(status);
CREATE INDEX IF NOT EXISTS idx_notice_due    ON notices(response_due_date);

CREATE TABLE IF NOT EXISTS notice_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id           UUID         NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  document_type       VARCHAR(30)  NOT NULL DEFAULT 'NOTICE_COPY',
  file_name           VARCHAR(255) NOT NULL,
  file_url            VARCHAR(500) NOT NULL,
  remarks             TEXT,
  uploaded_by_user_id UUID         NOT NULL REFERENCES users(id),
  uploaded_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_noticedoc_notice ON notice_documents(notice_id);

CREATE TABLE IF NOT EXISTS notice_activity_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id         UUID        NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  action            VARCHAR(50) NOT NULL,
  from_status       VARCHAR(30),
  to_status         VARCHAR(30),
  remarks           TEXT,
  action_by_user_id UUID        NOT NULL REFERENCES users(id),
  action_role       VARCHAR(30) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
