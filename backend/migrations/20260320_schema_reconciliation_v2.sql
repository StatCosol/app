-- =============================================================================
-- Migration: 20260320_schema_reconciliation_v2.sql
-- Purpose:   Create 22 missing tables whose entities exist but were only
--            defined in obsolete (failed) migrations. Also fix the
--            notification_messages column from thread_id → notification_id.
-- Date:      2026-03-20
-- Idempotent: All statements use IF NOT EXISTS / IF EXISTS guards.
-- =============================================================================

BEGIN;

-- =====================================================================
-- 1. NOTIFICATIONS — Central notification / query table
--    Entity: notification.entity.ts → 'notifications'
-- =====================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_user_id   UUID NOT NULL,
  created_by_role      VARCHAR(30) NOT NULL,
  query_type           VARCHAR(30) NOT NULL,
  subject              TEXT NOT NULL,
  client_id            UUID,
  branch_id            UUID,
  status               VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  priority             SMALLINT NOT NULL DEFAULT 2,
  assigned_to_user_id  UUID,
  assigned_to_role     VARCHAR(30),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at            TIMESTAMPTZ,
  read_at              TIMESTAMPTZ,
  is_archived          BOOLEAN NOT NULL DEFAULT FALSE,
  source_key           TEXT
);

CREATE INDEX IF NOT EXISTS idx_notif_client        ON notifications (client_id);
CREATE INDEX IF NOT EXISTS idx_notif_branch        ON notifications (branch_id);
CREATE INDEX IF NOT EXISTS idx_notif_created_by    ON notifications (created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_notif_assigned_to   ON notifications (assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_notif_status        ON notifications (status);
CREATE INDEX IF NOT EXISTS idx_notif_priority      ON notifications (priority);
CREATE INDEX IF NOT EXISTS idx_notif_query_type    ON notifications (query_type);
CREATE INDEX IF NOT EXISTS idx_notif_created_at    ON notifications (created_at);
CREATE INDEX IF NOT EXISTS idx_notif_client_status ON notifications (client_id, status);
CREATE INDEX IF NOT EXISTS idx_notif_assigned_status ON notifications (assigned_to_user_id, status);

-- =====================================================================
-- 2. NOTIFICATION_MESSAGES — add notification_id column
--    Entity expects notification_id (FK → notifications), baseline has thread_id
-- =====================================================================
ALTER TABLE notification_messages
  ADD COLUMN IF NOT EXISTS notification_id UUID;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_notif_msg_notification'
  ) THEN
    ALTER TABLE notification_messages
      ADD CONSTRAINT fk_notif_msg_notification
      FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notif_msg_notification_created
  ON notification_messages (notification_id, created_at);

-- =====================================================================
-- 3. FIX notification_reads FK to reference notifications
-- =====================================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_notification_reads_notification'
      AND confrelid = 'notification_threads'::regclass
  ) THEN
    ALTER TABLE notification_reads DROP CONSTRAINT fk_notification_reads_notification;
    ALTER TABLE notification_reads
      ADD CONSTRAINT fk_notification_reads_notification
      FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN undefined_table THEN
  -- notification_threads may not exist as a regclass; skip silently
  NULL;
END $$;

-- =====================================================================
-- 4. PAYROLL_CLIENT_ASSIGNMENTS
--    Entity: payroll-client-assignment.entity.ts
-- =====================================================================
CREATE TABLE IF NOT EXISTS payroll_client_assignments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_user_id  UUID NOT NULL,
  client_id        UUID NOT NULL,
  start_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date         DATE,
  status           VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pca_payroll_user ON payroll_client_assignments (payroll_user_id);
CREATE INDEX IF NOT EXISTS idx_pca_client       ON payroll_client_assignments (client_id);

-- =====================================================================
-- 5. PAYROLL_INPUTS
--    Entity: payroll-input.entity.ts
-- =====================================================================
CREATE TABLE IF NOT EXISTS payroll_inputs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID NOT NULL,
  branch_id             UUID,
  period_year           INT NOT NULL,
  period_month          INT NOT NULL,
  title                 VARCHAR(200) NOT NULL,
  notes                 TEXT,
  status                VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED',
  submitted_by_user_id  UUID NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pi_client ON payroll_inputs (client_id);
CREATE INDEX IF NOT EXISTS idx_pi_branch ON payroll_inputs (branch_id);

-- =====================================================================
-- 6. PAYROLL_INPUT_FILES
--    Entity: payroll-input-file.entity.ts
-- =====================================================================
CREATE TABLE IF NOT EXISTS payroll_input_files (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_input_id      UUID NOT NULL,
  doc_type              VARCHAR(80),
  file_name             VARCHAR(300) NOT NULL,
  file_path             TEXT NOT NULL,
  file_type             VARCHAR(120) NOT NULL,
  file_size             BIGINT NOT NULL DEFAULT 0,
  uploaded_by_user_id   UUID NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pif_input ON payroll_input_files (payroll_input_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pif_input') THEN
    ALTER TABLE payroll_input_files
      ADD CONSTRAINT fk_pif_input
      FOREIGN KEY (payroll_input_id) REFERENCES payroll_inputs(id) ON DELETE CASCADE;
  END IF;
END $$;

-- =====================================================================
-- 7. REGISTERS_RECORDS
--    Entity: registers-record.entity.ts
-- =====================================================================
CREATE TABLE IF NOT EXISTS registers_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID NOT NULL,
  branch_id             UUID,
  payroll_input_id      UUID,
  category              VARCHAR(20) NOT NULL,
  title                 VARCHAR(200) NOT NULL,
  period_year           INT,
  period_month          INT,
  prepared_by_user_id   UUID NOT NULL,
  file_name             VARCHAR(255) NOT NULL,
  file_path             TEXT NOT NULL,
  file_type             VARCHAR(120) NOT NULL,
  file_size             BIGINT NOT NULL DEFAULT 0,
  register_type         VARCHAR(60),
  state_code            VARCHAR(10),
  approval_status       VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  approved_by_user_id   UUID,
  approved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rr_client ON registers_records (client_id);

-- =====================================================================
-- 8. CONTRACTOR_DOCUMENTS
--    Entity: contractor-document.entity.ts
--    Note: column is contractor_user_id (NOT contractor_id)
-- =====================================================================
CREATE TABLE IF NOT EXISTS contractor_documents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_user_id    UUID NOT NULL,
  client_id             UUID NOT NULL,
  branch_id             UUID NOT NULL,
  doc_type              VARCHAR(255) NOT NULL,
  title                 VARCHAR(255) NOT NULL,
  audit_id              UUID,
  observation_id        UUID,
  file_name             VARCHAR(255) NOT NULL,
  file_path             TEXT NOT NULL,
  file_type             VARCHAR(100),
  file_size             BIGINT,
  uploaded_by_user_id   UUID NOT NULL,
  status                VARCHAR(30) NOT NULL DEFAULT 'UPLOADED',
  doc_month             VARCHAR(7),
  expiry_date           DATE,
  reviewed_by_user_id   UUID,
  reviewed_at           TIMESTAMPTZ,
  review_notes          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cd_contractor_user_id    ON contractor_documents (contractor_user_id);
CREATE INDEX IF NOT EXISTS idx_cd_client_id             ON contractor_documents (client_id);
CREATE INDEX IF NOT EXISTS idx_cd_branch_id             ON contractor_documents (branch_id);
CREATE INDEX IF NOT EXISTS idx_cd_audit_id              ON contractor_documents (audit_id);
CREATE INDEX IF NOT EXISTS idx_cd_observation_id        ON contractor_documents (observation_id);
CREATE INDEX IF NOT EXISTS idx_cd_uploaded_by_user_id   ON contractor_documents (uploaded_by_user_id);
CREATE INDEX IF NOT EXISTS idx_cd_created_at            ON contractor_documents (created_at);

-- =====================================================================
-- 9. HELPDESK_TICKETS
--    Entity: helpdesk-ticket.entity.ts
-- =====================================================================
CREATE TABLE IF NOT EXISTS helpdesk_tickets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category              VARCHAR(40) NOT NULL,
  sub_category          VARCHAR(80),
  client_id             UUID NOT NULL,
  branch_id             UUID,
  employee_ref          VARCHAR(80),
  priority              VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  status                VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  description           TEXT NOT NULL,
  created_by_user_id    UUID NOT NULL,
  assigned_to_user_id   UUID,
  sla_due_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ht_client ON helpdesk_tickets (client_id);
CREATE INDEX IF NOT EXISTS idx_ht_status ON helpdesk_tickets (status);

-- =====================================================================
-- 10. HELPDESK_MESSAGES
--     Entity: helpdesk-message.entity.ts
-- =====================================================================
CREATE TABLE IF NOT EXISTS helpdesk_messages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id             UUID NOT NULL,
  sender_user_id        UUID NOT NULL,
  message               TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hm_ticket ON helpdesk_messages (ticket_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_hm_ticket') THEN
    ALTER TABLE helpdesk_messages
      ADD CONSTRAINT fk_hm_ticket
      FOREIGN KEY (ticket_id) REFERENCES helpdesk_tickets(id) ON DELETE CASCADE;
  END IF;
END $$;

-- =====================================================================
-- 11. HELPDESK_MESSAGE_FILES
--     Entity: helpdesk-message-file.entity.ts
-- =====================================================================
CREATE TABLE IF NOT EXISTS helpdesk_message_files (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id            UUID NOT NULL,
  file_name             VARCHAR(255) NOT NULL,
  file_path             TEXT NOT NULL,
  file_type             VARCHAR(120) NOT NULL,
  file_size             BIGINT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hmf_message ON helpdesk_message_files (message_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_hmf_message') THEN
    ALTER TABLE helpdesk_message_files
      ADD CONSTRAINT fk_hmf_message
      FOREIGN KEY (message_id) REFERENCES helpdesk_messages(id) ON DELETE CASCADE;
  END IF;
END $$;

-- =====================================================================
-- 12. PAYROLL_TEMPLATES
--     Entity: payroll-template.entity.ts
-- =====================================================================
CREATE TABLE IF NOT EXISTS payroll_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL UNIQUE,
  version       INT NOT NULL DEFAULT 1,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  file_name     VARCHAR(300),
  file_path     TEXT,
  file_type     VARCHAR(150),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 13. PAYROLL_TEMPLATE_COMPONENTS
--     Entity: payroll-template-component.entity.ts
-- =====================================================================
CREATE TABLE IF NOT EXISTS payroll_template_components (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id           UUID NOT NULL,
  code                  VARCHAR(255) NOT NULL,
  label                 VARCHAR(255) NOT NULL,
  type                  VARCHAR(255) NOT NULL,
  input_type            VARCHAR(255),
  default_value         FLOAT,
  order_no              INT NOT NULL DEFAULT 0,
  is_taxable            BOOLEAN NOT NULL DEFAULT FALSE,
  is_statutory          BOOLEAN NOT NULL DEFAULT FALSE,
  formula_expression    VARCHAR(255),
  round_rule            VARCHAR(255)
);

-- Rename camelCase column from TypeORM auto-sync if it exists
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_template_components' AND column_name = 'templateId'
  ) THEN
    ALTER TABLE payroll_template_components RENAME COLUMN "templateId" TO template_id;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ptc_template') THEN
    ALTER TABLE payroll_template_components
      ADD CONSTRAINT fk_ptc_template
      FOREIGN KEY (template_id) REFERENCES payroll_templates(id) ON DELETE CASCADE;
  END IF;
END $$;

-- =====================================================================
-- 14. PAYROLL_CLIENT_TEMPLATE
--     Entity: payroll-client-template.entity.ts
-- =====================================================================
CREATE TABLE IF NOT EXISTS payroll_client_template (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL,
  template_id     UUID NOT NULL,
  effective_from  DATE NOT NULL,
  effective_to    DATE
);

-- Rename camelCase column from TypeORM auto-sync if it exists
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_client_template' AND column_name = 'templateId'
  ) THEN
    ALTER TABLE payroll_client_template RENAME COLUMN "templateId" TO template_id;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pct_template') THEN
    ALTER TABLE payroll_client_template
      ADD CONSTRAINT fk_pct_template
      FOREIGN KEY (template_id) REFERENCES payroll_templates(id) ON DELETE CASCADE;
  END IF;
END $$;

-- =====================================================================
-- 15. PAYROLL_CLIENT_PAYSLIP_LAYOUT
--     Entity: payroll-client-payslip-layout.entity.ts
-- =====================================================================
CREATE TABLE IF NOT EXISTS payroll_client_payslip_layout (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL UNIQUE,
  layout_json   JSONB NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 16. PAYROLL_INPUT_STATUS_HISTORY
--     Entity: payroll-input-status-history.entity.ts
-- =====================================================================
CREATE TABLE IF NOT EXISTS payroll_input_status_history (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_input_id      UUID NOT NULL,
  from_status           VARCHAR(50),
  to_status             VARCHAR(50) NOT NULL,
  changed_by_user_id    UUID NOT NULL,
  remarks               VARCHAR(500),
  changed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pish_input   ON payroll_input_status_history (payroll_input_id);
CREATE INDEX IF NOT EXISTS idx_pish_changed ON payroll_input_status_history (changed_by_user_id);

-- =====================================================================
-- 17. DOCUMENT_REMARKS
--     Entity: document-remark.entity.ts
-- =====================================================================
CREATE TABLE IF NOT EXISTS document_remarks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id           BIGINT NOT NULL,
  document_type         VARCHAR(50) NOT NULL,
  created_by_role       VARCHAR(20) NOT NULL,
  created_by_user_id    UUID NOT NULL,
  visibility            VARCHAR(30) NOT NULL DEFAULT 'INTERNAL',
  text                  TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dr_document ON document_remarks (document_id, document_type);

-- =====================================================================
-- 18. DOCUMENT_REUPLOAD_REQUESTS
--     Entity: document-reupload-request.entity.ts
--     Note: uses contractor_user_id (NOT contractor_id)
-- =====================================================================
CREATE TABLE IF NOT EXISTS document_reupload_requests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id             BIGINT NOT NULL,
  document_type           VARCHAR(50) NOT NULL,
  client_id               UUID NOT NULL,
  unit_id                 UUID,
  contractor_user_id      UUID,
  target_role             VARCHAR(20) NOT NULL,
  requested_by_role       VARCHAR(20) NOT NULL,
  requested_by_user_id    UUID NOT NULL,
  reason                  VARCHAR(200) NOT NULL,
  remarks_visible         TEXT NOT NULL,
  status                  VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  deadline_date           DATE,
  submitted_at            TIMESTAMPTZ,
  reverified_at           TIMESTAMPTZ,
  reverified_by_user_id   UUID,
  crm_remarks             TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drr_document ON document_reupload_requests (document_id, document_type);
CREATE INDEX IF NOT EXISTS idx_drr_client   ON document_reupload_requests (client_id);
CREATE INDEX IF NOT EXISTS idx_drr_status   ON document_reupload_requests (status);

-- =====================================================================
-- 19. DOCUMENT_VERSIONS
--     Entity: document-version.entity.ts
-- =====================================================================
CREATE TABLE IF NOT EXISTS document_versions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id           BIGINT NOT NULL,
  document_type         VARCHAR(50) NOT NULL,
  version_no            INT NOT NULL,
  file_path             TEXT NOT NULL,
  file_name             VARCHAR(255) NOT NULL,
  file_type             VARCHAR(150),
  file_size             BIGINT,
  uploaded_by_role      VARCHAR(20) NOT NULL,
  uploaded_by_user_id   UUID NOT NULL,
  reupload_request_id   UUID,
  uploaded_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dv_document ON document_versions (document_id, document_type);

-- =====================================================================
-- 20. CONTRACTOR_REQUIRED_DOCUMENTS
--     Entity: contractor-required-document.entity.ts
--     Note: uses contractor_user_id (NOT contractor_id)
-- =====================================================================
CREATE TABLE IF NOT EXISTS contractor_required_documents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID NOT NULL,
  contractor_user_id    UUID NOT NULL,
  branch_id             UUID,
  doc_type              VARCHAR(255) NOT NULL,
  is_required           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crd_contractor ON contractor_required_documents (contractor_user_id);
CREATE INDEX IF NOT EXISTS idx_crd_client     ON contractor_required_documents (client_id);
CREATE INDEX IF NOT EXISTS idx_crd_branch     ON contractor_required_documents (branch_id);
CREATE INDEX IF NOT EXISTS idx_crd_doc_type   ON contractor_required_documents (doc_type);

-- =====================================================================
-- 21. LEAVE_POLICIES
--     Entity: leave-policy.entity.ts
-- =====================================================================
CREATE TABLE IF NOT EXISTS leave_policies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID NOT NULL,
  branch_id             UUID,
  leave_type            VARCHAR(30) NOT NULL,
  leave_name            VARCHAR(100) NOT NULL,
  accrual_method        VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
  accrual_rate          NUMERIC(5,2) NOT NULL DEFAULT 0,
  carry_forward_limit   NUMERIC(5,2) NOT NULL DEFAULT 0,
  yearly_limit          NUMERIC(5,2) NOT NULL DEFAULT 0,
  allow_negative        BOOLEAN NOT NULL DEFAULT FALSE,
  min_notice_days       INT NOT NULL DEFAULT 0,
  max_days_per_request  NUMERIC(5,2) NOT NULL DEFAULT 0,
  requires_document     BOOLEAN NOT NULL DEFAULT FALSE,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lp_client     ON leave_policies (client_id);
CREATE INDEX IF NOT EXISTS idx_lp_client_type ON leave_policies (client_id, leave_type);

-- =====================================================================
-- 22. LEAVE_BALANCES
--     Entity: leave-balance.entity.ts
-- =====================================================================
CREATE TABLE IF NOT EXISTS leave_balances (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           UUID NOT NULL,
  client_id             UUID NOT NULL,
  year                  INT NOT NULL,
  leave_type            VARCHAR(30) NOT NULL,
  opening               NUMERIC(5,2) NOT NULL DEFAULT 0,
  accrued               NUMERIC(5,2) NOT NULL DEFAULT 0,
  used                  NUMERIC(5,2) NOT NULL DEFAULT 0,
  lapsed                NUMERIC(5,2) NOT NULL DEFAULT 0,
  available             NUMERIC(5,2) NOT NULL DEFAULT 0,
  last_updated_at       TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, year, leave_type)
);

CREATE INDEX IF NOT EXISTS idx_lb_employee ON leave_balances (employee_id);
CREATE INDEX IF NOT EXISTS idx_lb_client   ON leave_balances (client_id);

-- =====================================================================
-- 23. LEAVE_APPLICATIONS
--     Entity: leave-application.entity.ts
-- =====================================================================
CREATE TABLE IF NOT EXISTS leave_applications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           UUID NOT NULL,
  client_id             UUID NOT NULL,
  branch_id             UUID,
  leave_type            VARCHAR(30) NOT NULL,
  from_date             DATE NOT NULL,
  to_date               DATE NOT NULL,
  total_days            NUMERIC(5,2) NOT NULL,
  reason                TEXT,
  status                VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  approver_user_id      UUID,
  applied_at            TIMESTAMPTZ,
  actioned_at           TIMESTAMPTZ,
  rejection_reason      TEXT,
  attachment_path       TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_la_employee ON leave_applications (employee_id);
CREATE INDEX IF NOT EXISTS idx_la_client   ON leave_applications (client_id);
CREATE INDEX IF NOT EXISTS idx_la_branch   ON leave_applications (branch_id);
CREATE INDEX IF NOT EXISTS idx_la_approver ON leave_applications (approver_user_id);

-- =====================================================================
-- 24. LEAVE_LEDGER
--     Entity: leave-ledger.entity.ts
-- =====================================================================
CREATE TABLE IF NOT EXISTS leave_ledger (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           UUID NOT NULL,
  client_id             UUID NOT NULL,
  leave_type            VARCHAR(30) NOT NULL,
  entry_date            DATE NOT NULL,
  qty                   NUMERIC(5,2) NOT NULL,
  ref_type              VARCHAR(30) NOT NULL,
  ref_id                UUID,
  remarks               TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ll_employee ON leave_ledger (employee_id);
CREATE INDEX IF NOT EXISTS idx_ll_client   ON leave_ledger (client_id);

-- =====================================================================
-- 25. EMPLOYEE_NOMINATIONS — ensure all workflow columns exist
--     Entity: employee-nomination.entity.ts
-- =====================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employee_nominations') THEN
    ALTER TABLE employee_nominations
      ADD COLUMN IF NOT EXISTS client_id           UUID,
      ADD COLUMN IF NOT EXISTS branch_id           UUID,
      ADD COLUMN IF NOT EXISTS declaration_date    DATE,
      ADD COLUMN IF NOT EXISTS witness_name        VARCHAR(200),
      ADD COLUMN IF NOT EXISTS witness_address     TEXT,
      ADD COLUMN IF NOT EXISTS submitted_at        TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS approved_at         TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS approved_by_user_id UUID,
      ADD COLUMN IF NOT EXISTS rejection_reason    TEXT;
  END IF;
END $$;

-- =====================================================================
-- DONE
-- =====================================================================

COMMIT;
