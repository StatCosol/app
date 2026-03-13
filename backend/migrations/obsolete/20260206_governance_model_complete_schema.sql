-- ============================================================================
-- STATCO GOVERNANCE MODEL - COMPLETE DATABASE SCHEMA
-- Supports: Dashboards, Drill-downs, Actions, Notifications, Assignments, Audits
-- Created: 2026-02-06
-- PostgreSQL 14+
-- ============================================================================

-- ============================================================================
-- 1) CORE TABLES
-- ============================================================================

-- A) Clients
CREATE TABLE IF NOT EXISTS clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  state         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ
);

-- Backfill column for pre-existing tables
ALTER TABLE clients ADD COLUMN IF NOT EXISTS state TEXT;

CREATE INDEX IF NOT EXISTS idx_clients_state ON clients(state);
CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(is_active);

COMMENT ON TABLE clients IS 'Master table for client organizations';
COMMENT ON COLUMN clients.state IS 'Geographic state for filtering (Telangana, Karnataka, etc.)';

-- B) Branches
CREATE TABLE IF NOT EXISTS branches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  location      TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_branches_client ON branches(client_id);
CREATE INDEX IF NOT EXISTS idx_branches_active ON branches(client_id, is_active);

COMMENT ON TABLE branches IS 'Branch/plant locations under client organizations';

-- ============================================================================
-- 2) USERS & ROLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  role          TEXT NOT NULL,  -- ADMIN | CRM | AUDITOR | LEGITX | CONTRACTOR | CEO | CCO
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ
);

-- Backfill critical columns for existing installs
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT;
UPDATE users SET role = COALESCE(role, 'CRM');
ALTER TABLE users ALTER COLUMN role SET NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active_role ON users(is_active, role);

COMMENT ON TABLE users IS 'System users with role-based access control';
COMMENT ON COLUMN users.role IS 'ADMIN=Control Tower, CRM=Compliance Owner, AUDITOR=Audit Execution, LEGITX=Client User, CONTRACTOR=External Worker';

-- ============================================================================
-- 3) ASSIGNMENTS (WITH ROTATION + NO DUPLICATES)
-- ============================================================================

-- A) Current Active Assignments
CREATE TABLE IF NOT EXISTS client_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  assignment_type  TEXT NOT NULL,  -- CRM | AUDITOR
  assigned_user_id UUID NOT NULL REFERENCES users(id),
  assigned_on      DATE NOT NULL DEFAULT CURRENT_DATE,
  rotation_due_on  DATE NOT NULL,
  status           TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | INACTIVE | OVERDUE_ROTATION
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ,
  
  CONSTRAINT chk_assignment_type CHECK (assignment_type IN ('CRM', 'AUDITOR')),
  CONSTRAINT chk_assignment_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'OVERDUE_ROTATION'))
);

-- CRITICAL: Prevent duplicates - only one ACTIVE assignment per (client, type)
CREATE UNIQUE INDEX IF NOT EXISTS ux_client_assignments_active
ON client_assignments (client_id, assignment_type)
WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_client_assignments_user ON client_assignments(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_client_assignments_due ON client_assignments(rotation_due_on) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_client_assignments_type_status ON client_assignments(assignment_type, status);

COMMENT ON TABLE client_assignments IS 'Current active CRM/Auditor assignments with rotation tracking';
COMMENT ON INDEX ux_client_assignments_active IS 'Ensures one client has only one active CRM and one active Auditor at a time';

-- B) Assignment History (Audit Trail)
CREATE TABLE IF NOT EXISTS client_assignment_history (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  assignment_type   TEXT NOT NULL,
  old_user_id       UUID REFERENCES users(id),
  new_user_id       UUID NOT NULL REFERENCES users(id),
  effective_date    DATE NOT NULL,
  reason            TEXT NOT NULL,
  changed_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT chk_history_assignment_type CHECK (assignment_type IN ('CRM', 'AUDITOR'))
);

ALTER TABLE client_assignment_history ADD COLUMN IF NOT EXISTS new_user_id UUID REFERENCES users(id);
ALTER TABLE client_assignment_history ADD COLUMN IF NOT EXISTS effective_date DATE;

CREATE INDEX IF NOT EXISTS idx_assignment_history_client ON client_assignment_history(client_id);
CREATE INDEX IF NOT EXISTS idx_assignment_history_user ON client_assignment_history(new_user_id);
CREATE INDEX IF NOT EXISTS idx_assignment_history_date ON client_assignment_history(effective_date DESC);

COMMENT ON TABLE client_assignment_history IS 'Complete audit trail of all assignment changes and rotations';

-- ============================================================================
-- 4) NOTIFICATIONS (ROUTING + INBOX/OUTBOX)
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id    UUID NOT NULL REFERENCES users(id),
  from_role       TEXT NOT NULL,
  to_user_id      UUID NOT NULL REFERENCES users(id),
  to_role         TEXT NOT NULL,

  client_id       UUID REFERENCES clients(id),
  branch_id       UUID REFERENCES branches(id),

  query_type      TEXT, -- TECHNICAL | COMPLIANCE | AUDIT | SYSTEM
  subject         TEXT NOT NULL,
  message         TEXT NOT NULL,

  context_type    TEXT, -- AUDIT | ASSIGNMENT | COMPLIANCE | SYSTEM
  context_ref_id  TEXT,

  status          TEXT NOT NULL DEFAULT 'UNREAD', -- UNREAD | READ | CLOSED
  priority        TEXT NOT NULL DEFAULT 'NORMAL', -- LOW | NORMAL | HIGH | CRITICAL
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at         TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  
  CONSTRAINT chk_notification_status CHECK (status IN ('UNREAD', 'READ', 'CLOSED')),
  CONSTRAINT chk_notification_priority CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'CRITICAL')),
  CONSTRAINT chk_notification_query_type CHECK (query_type IN ('TECHNICAL', 'COMPLIANCE', 'AUDIT', 'SYSTEM'))
);

-- Backfill routing columns before index creation
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS from_user_id UUID REFERENCES users(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS from_role TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS to_user_id UUID REFERENCES users(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS to_role TEXT;

CREATE INDEX IF NOT EXISTS idx_notifications_to_user ON notifications(to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_from_user ON notifications(from_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_client ON notifications(client_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(to_user_id, created_at DESC) WHERE status = 'UNREAD';

COMMENT ON TABLE notifications IS 'Universal inbox/outbox system with smart routing';
COMMENT ON COLUMN notifications.query_type IS 'Routes to appropriate role: TECHNICAL→Admin, COMPLIANCE→CRM, AUDIT→Auditor';

-- ============================================================================
-- 5) COMPLIANCE TRACKING (FOR CRM DASHBOARDS)
-- ============================================================================

-- A) Compliance Items Master
CREATE TABLE IF NOT EXISTS compliance_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category      TEXT NOT NULL,  -- Factories Act, EPF, ESI, Shops & Establishments, etc.
  title         TEXT NOT NULL,  -- "Pressure Vessel - External Examination"
  description   TEXT,
  risk          TEXT NOT NULL DEFAULT 'MEDIUM', -- CRITICAL | HIGH | MEDIUM | LOW
  frequency     TEXT NOT NULL,  -- MONTHLY | QUARTERLY | HALF_YEARLY | YEARLY | ON_EVENT
  law_reference TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ,
  
  CONSTRAINT chk_compliance_risk CHECK (risk IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  CONSTRAINT chk_compliance_frequency CHECK (frequency IN ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'ON_EVENT'))
);

CREATE INDEX IF NOT EXISTS idx_compliance_items_category ON compliance_items(category);
CREATE INDEX IF NOT EXISTS idx_compliance_items_active ON compliance_items(is_active);

COMMENT ON TABLE compliance_items IS 'Master list of all compliance obligations';

-- B) Branch Compliance Schedule (Generated per branch)
CREATE TABLE IF NOT EXISTS branch_compliance_schedule (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id           UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  compliance_item_id  UUID NOT NULL REFERENCES compliance_items(id),
  due_date            DATE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | COMPLETED | WAIVED | OVERDUE
  completed_on        DATE,
  completed_by_user_id UUID REFERENCES users(id),
  remarks             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ,
  
  CONSTRAINT chk_schedule_status CHECK (status IN ('PENDING', 'COMPLETED', 'WAIVED', 'OVERDUE'))
);

CREATE INDEX IF NOT EXISTS idx_schedule_branch_due ON branch_compliance_schedule(branch_id, due_date);
CREATE INDEX IF NOT EXISTS idx_schedule_status_due ON branch_compliance_schedule(status, due_date);
CREATE INDEX IF NOT EXISTS idx_schedule_overdue ON branch_compliance_schedule(branch_id, status) WHERE status = 'OVERDUE';

COMMENT ON TABLE branch_compliance_schedule IS 'Scheduled compliance items per branch with tracking';

-- ============================================================================
-- 6) AUDITS & OBSERVATIONS (FOR AUDITOR DASHBOARDS)
-- ============================================================================

-- A) Audits
CREATE TABLE IF NOT EXISTS audits (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES clients(id),
  branch_id           UUID REFERENCES branches(id),
  audit_type          TEXT NOT NULL, -- STATUTORY | INTERNAL | CLIENT_SPECIFIC
  audit_name          TEXT NOT NULL,
  assigned_auditor_id UUID NOT NULL REFERENCES users(id),
  start_date          DATE,
  due_date            DATE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'ASSIGNED', -- ASSIGNED | IN_PROGRESS | COMPLETED | SUBMITTED
  progress_pct        INT NOT NULL DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),
  last_updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  
  CONSTRAINT chk_audit_type CHECK (audit_type IN ('STATUTORY', 'INTERNAL', 'CLIENT_SPECIFIC')),
  CONSTRAINT chk_audit_status CHECK (status IN ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'SUBMITTED'))
);

CREATE INDEX IF NOT EXISTS idx_audits_assigned_due ON audits(assigned_auditor_id, due_date);
CREATE INDEX IF NOT EXISTS idx_audits_status_due ON audits(status, due_date);
CREATE INDEX IF NOT EXISTS idx_audits_client ON audits(client_id);
-- Stable partial index (avoid non-immutable predicate)
CREATE INDEX IF NOT EXISTS idx_audits_overdue ON audits(assigned_auditor_id, due_date) WHERE status IN ('ASSIGNED', 'IN_PROGRESS');

COMMENT ON TABLE audits IS 'Audit assignments and execution tracking';

-- Backfill critical columns for existing installs
ALTER TABLE audits ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE audits ADD COLUMN IF NOT EXISTS assigned_auditor_id UUID REFERENCES users(id);

-- B) Audit Observations
CREATE TABLE IF NOT EXISTS audit_observations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id         UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  risk             TEXT NOT NULL, -- CRITICAL | HIGH | MEDIUM | LOW
  law_reference    TEXT,
  recommendation   TEXT,
  status           TEXT NOT NULL DEFAULT 'OPEN', -- OPEN | IN_PROGRESS | RESOLVED | CLOSED
  owner_role       TEXT, -- CRM | LEGITX (who must close)
  owner_user_id    UUID REFERENCES users(id),
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ,
  closed_at        TIMESTAMPTZ,
  closure_remarks  TEXT,
  
  CONSTRAINT chk_observation_risk CHECK (risk IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  CONSTRAINT chk_observation_status CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'))
);

CREATE INDEX IF NOT EXISTS idx_obs_audit_risk ON audit_observations(audit_id, risk, status);
CREATE INDEX IF NOT EXISTS idx_obs_status ON audit_observations(status);
CREATE INDEX IF NOT EXISTS idx_obs_high_risk_open ON audit_observations(risk, status) WHERE risk IN ('CRITICAL', 'HIGH') AND status IN ('OPEN', 'IN_PROGRESS');

COMMENT ON TABLE audit_observations IS 'Findings and non-compliances identified during audits';

-- ============================================================================
-- 7) EVIDENCE / FILE ATTACHMENTS (SHARED)
-- ============================================================================

-- A) Files
CREATE TABLE IF NOT EXISTS files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name     TEXT NOT NULL,
  file_url      TEXT NOT NULL,
  mime_type     TEXT,
  size_bytes    BIGINT,
  uploaded_by   UUID REFERENCES users(id),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON files(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_files_uploaded_at ON files(uploaded_at DESC);

COMMENT ON TABLE files IS 'Central file storage metadata';

-- B) Evidence Links (Polymorphic)
CREATE TABLE IF NOT EXISTS evidence_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id       UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  entity_type   TEXT NOT NULL,  -- COMPLIANCE | AUDIT | OBSERVATION | NOTIFICATION
  entity_id     UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT chk_evidence_entity_type CHECK (entity_type IN ('COMPLIANCE', 'AUDIT', 'OBSERVATION', 'NOTIFICATION'))
);

CREATE INDEX IF NOT EXISTS idx_evidence_entity ON evidence_links(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_evidence_file ON evidence_links(file_id);

COMMENT ON TABLE evidence_links IS 'Links files to any entity (polymorphic relationship)';

-- ============================================================================
-- 8) AUDIT REPORTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id         UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  report_title     TEXT NOT NULL,
  summary          TEXT,
  status           TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT | PENDING_SUBMISSION | SUBMITTED | APPROVED | REJECTED
  submitted_at     TIMESTAMPTZ,
  approved_at      TIMESTAMPTZ,
  approved_by      UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ,
  
  CONSTRAINT chk_report_status CHECK (status IN ('DRAFT', 'PENDING_SUBMISSION', 'SUBMITTED', 'APPROVED', 'REJECTED'))
);

-- Backfill status column when table already exists
ALTER TABLE audit_reports ADD COLUMN IF NOT EXISTS status TEXT;

CREATE INDEX IF NOT EXISTS idx_reports_audit ON audit_reports(audit_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON audit_reports(status);

 COMMENT ON TABLE audit_reports IS 'Formal audit reports submitted by auditors';

-- ============================================================================
-- 9) ADMIN ESCALATIONS VIEW (DERIVED)
-- ============================================================================

-- View combining all escalation sources for Admin Control Tower
DO $$
BEGIN
  BEGIN
    EXECUTE $view$
    CREATE OR REPLACE VIEW admin_escalations_view AS
    -- Overdue Audits
    SELECT
      'AUDIT' AS issue_type,
      a.id AS ref_id,
      a.client_id,
      c.client_name AS client_name,
      a.branch_id,
      b.branch_name AS branch_name,
      'AUDIT_OVERDUE' AS reason,
      'AUDITOR' AS owner_role,
      a.assigned_auditor_id AS owner_user_id,
      u.name AS owner_name,
      (CURRENT_DATE - a.due_date) AS days_delayed,
      a.updated_at AS last_updated_at
    FROM audits a
    JOIN clients c ON a.client_id = c.id
    LEFT JOIN branches b ON a.branch_id = b.id
    JOIN users u ON a.assigned_auditor_id = u.id
    WHERE a.status IN ('ASSIGNED', 'IN_PROGRESS') 
      AND a.due_date < CURRENT_DATE

    UNION ALL

    -- Overdue Assignment Rotations
    SELECT
      'ASSIGNMENT' AS issue_type,
      ca.id AS ref_id,
      ca.client_id,
      c.client_name AS client_name,
      NULL::UUID AS branch_id, -- FIXED: Cast NULL to UUID
      NULL AS branch_name,
      'ROTATION_OVERDUE' AS reason,
      ca.assignment_type AS owner_role,
      ca.assigned_user_id AS owner_user_id,
      u.name AS owner_name,
      (CURRENT_DATE - ca.rotation_due_on) AS days_delayed,
      ca.updated_at AS last_updated_at
    FROM client_assignments ca
    JOIN clients c ON ca.client_id = c.id
    JOIN users u ON ca.assigned_user_id = u.id
    WHERE ca.status = 'ACTIVE' 
      AND ca.rotation_due_on < CURRENT_DATE

    UNION ALL

    -- High-Risk Open Observations
    SELECT
      'OBSERVATION' AS issue_type,
      obs.id AS ref_id,
      a.client_id,
      c.client_name AS client_name,
      a.branch_id,
      b.branch_name AS branch_name,
      'HIGH_RISK_OPEN' AS reason,
      'CRM' AS owner_role,
      COALESCE(obs.recorded_by_user_id, obs.created_by_user_id) AS owner_user_id,
      u.name AS owner_name,
      EXTRACT(DAY FROM (CURRENT_TIMESTAMP - obs.created_at))::INT AS days_delayed,
      obs.updated_at AS last_updated_at
    FROM audit_observations obs
    JOIN audits a ON obs.audit_id = a.id
    JOIN clients c ON a.client_id = c.id
    LEFT JOIN branches b ON a.branch_id = b.id
    LEFT JOIN users u ON COALESCE(obs.recorded_by_user_id, obs.created_by_user_id) = u.id
    WHERE obs.severity IN ('CRITICAL', 'HIGH') 
      AND obs.status IN ('OPEN', 'IN_PROGRESS');
    $view$;
    COMMENT ON VIEW admin_escalations_view IS 'Admin Control Tower escalation queue - combines overdue audits, rotations, and high-risk observations';
  EXCEPTION WHEN undefined_column THEN
    RAISE NOTICE 'Skipping admin_escalations_view creation (missing columns)';
  END;
END $$;

-- ============================================================================
-- 10) SYSTEM HEALTH METRICS (FOR ADMIN)
-- ============================================================================

DO $$
BEGIN
  BEGIN
    EXECUTE $view$
    CREATE OR REPLACE VIEW admin_system_health_view AS
    SELECT
      (SELECT COUNT(*) FROM users WHERE is_active = TRUE AND last_login_at < (CURRENT_TIMESTAMP - INTERVAL '15 days')) AS inactive_users_15d,
      (SELECT COUNT(*) FROM clients WHERE is_active = TRUE AND id NOT IN (SELECT DISTINCT client_id FROM client_assignments WHERE status = 'ACTIVE')) AS unassigned_clients,
      (SELECT COUNT(*) FROM notifications WHERE status = 'UNREAD' AND to_role = 'ADMIN' AND created_at > (CURRENT_TIMESTAMP - INTERVAL '7 days')) AS failed_notifications_7d,
      0 AS failed_jobs_24h; -- Placeholder for background job monitoring
    $view$;
    COMMENT ON VIEW admin_system_health_view IS 'System health metrics for Admin dashboard';
  EXCEPTION WHEN undefined_column THEN
    RAISE NOTICE 'Skipping admin_system_health_view creation (missing columns)';
  END;
END $$;

-- ============================================================================
-- 11) HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate rotation due date based on assignment type
CREATE OR REPLACE FUNCTION calculate_rotation_due_date(
  p_assignment_type TEXT,
  p_assigned_on DATE
) RETURNS DATE AS $$
BEGIN
  CASE p_assignment_type
    WHEN 'CRM' THEN
      RETURN p_assigned_on + INTERVAL '12 months';
    WHEN 'AUDITOR' THEN
      RETURN p_assigned_on + INTERVAL '4 months';
    ELSE
      RETURN p_assigned_on + INTERVAL '12 months'; -- Default
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_rotation_due_date IS 'Calculates rotation due date: CRM=12mo, Auditor=4mo';

-- Trigger to auto-calculate rotation_due_on if not provided
CREATE OR REPLACE FUNCTION set_rotation_due_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.rotation_due_on IS NULL THEN
    NEW.rotation_due_on := calculate_rotation_due_date(NEW.assignment_type, NEW.assigned_on);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_rotation_due_date ON client_assignments;
CREATE TRIGGER trg_set_rotation_due_date
  BEFORE INSERT ON client_assignments
  FOR EACH ROW
  EXECUTE FUNCTION set_rotation_due_date();

-- ============================================================================
-- 12) GRANT PERMISSIONS (ADJUST AS NEEDED)
-- ============================================================================

-- Example: Grant read access to application role
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO statco_app_role;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO statco_app_role;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
