-- Statco / LegitX schema (best-effort extraction from current backend compiled entities)
-- Date: 2026-01-20
-- Target: PostgreSQL 13+

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------
-- ENUMS
-- ------------------
DO $$ BEGIN
  CREATE TYPE assignment_status_enum AS ENUM ('ACTIVE','INACTIVE','PENDING','EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE frequency_enum AS ENUM ('MONTHLY','QUARTERLY','HALF_YEARLY','YEARLY','EVENT_BASED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE audit_type_enum AS ENUM ('INTERNAL','EXTERNAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE branch_type_enum AS ENUM ('HO','ZONAL','SALES','ESTABLISHMENT','FACTORY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------
-- CORE MASTER TABLES
-- ------------------

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(30) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code varchar(20) NOT NULL UNIQUE,
  client_name varchar(200) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  is_active boolean NOT NULL DEFAULT true,

  -- soft delete
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz NULL,
  deleted_by uuid NULL,
  delete_reason text NULL,

  -- assignments (denormalized convenience fields)
  assigned_crm_id uuid NULL,
  assigned_auditor_id uuid NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_code varchar(30) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  email varchar(180) NOT NULL UNIQUE,
  mobile varchar(20) NULL,
  password_hash varchar(255) NOT NULL,

  role_id uuid NOT NULL REFERENCES roles(id),

  -- direct client scope (CONTRACTOR mostly)
  client_id uuid NULL REFERENCES clients(id),

  -- CRM owned by a CCO user
  owner_cco_id uuid NULL REFERENCES users(id),

  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_client_id ON users(client_id);
CREATE INDEX IF NOT EXISTS idx_users_owner_cco_id ON users(owner_cco_id);

-- user<->client link table used by ADMIN/CEO/CCO/CRM/AUDITOR accounts
CREATE TABLE IF NOT EXISTS client_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, user_id)
);

-- ------------------
-- BRANCHES
-- ------------------

CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  branch_code varchar(50) NOT NULL UNIQUE,
  branch_name varchar(200) NOT NULL,
  branch_type branch_type_enum NOT NULL,
  address text NULL,
  state varchar(50) NOT NULL,
  city varchar(50) NULL,
  pincode varchar(10) NULL,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branches_client_id ON branches(client_id);

-- Many-to-many between users and branches (JoinTable: user_branches)
CREATE TABLE IF NOT EXISTS user_branches (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, branch_id)
);

-- Contractor mapping table
CREATE TABLE IF NOT EXISTS branch_contractor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  contractor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, branch_id, contractor_user_id)
);

-- ------------------
-- ASSIGNMENTS
-- ------------------

CREATE TABLE IF NOT EXISTS client_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  crm_user_id uuid NULL REFERENCES users(id),
  auditor_user_id uuid NULL REFERENCES users(id),
  status assignment_status_enum NOT NULL DEFAULT 'ACTIVE',
  start_date date NULL,
  end_date date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_assignments_current (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  assignment_type varchar NOT NULL,
  assigned_to_user_id uuid NULL REFERENCES users(id),
  start_date timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_assignments_current_client_type UNIQUE (client_id, assignment_type)
);

CREATE TABLE IF NOT EXISTS client_assignments_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  assignment_type varchar NOT NULL,
  assigned_to_user_id uuid NULL REFERENCES users(id),
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz NULL,
  changed_by_user_id uuid NULL REFERENCES users(id),
  change_reason varchar NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------
-- COMPLIANCE MASTER & APPLICABILITY
-- ------------------

CREATE TABLE IF NOT EXISTS compliance_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(120) NOT NULL,
  compliance_name varchar(250) NOT NULL,
  law_name varchar(250) NOT NULL,
  law_family varchar(100) NOT NULL,
  state_scope varchar(50) NULL,
  min_headcount int NULL,
  max_headcount int NULL,
  frequency frequency_enum NOT NULL,
  description text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compliance_master_code ON compliance_master(code);

CREATE TABLE IF NOT EXISTS compliance_applicability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compliance_id uuid NOT NULL REFERENCES compliance_master(id) ON DELETE CASCADE,
  state_code varchar(10) NULL,
  branch_category varchar(30) NOT NULL,
  min_headcount int NULL,
  max_headcount int NULL,
  priority int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_applicability_comp ON compliance_applicability(compliance_id);

-- ------------------
-- BRANCH CHECKLIST / COMPLIANCES
-- ------------------

CREATE TABLE IF NOT EXISTS branch_compliances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  compliance_id uuid NULL REFERENCES compliance_master(id),
  owner_user_id uuid NULL REFERENCES users(id),
  is_applicable boolean NOT NULL,
  source varchar(255) NOT NULL,
  reason text NULL,
  status varchar(30) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_updated timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branch_compliances_branch ON branch_compliances(branch_id);

-- ------------------
-- COMPLIANCE TASKS / COMMENTS / EVIDENCE (operational)
-- ------------------

CREATE TABLE IF NOT EXISTS compliance_tasks (
  id bigserial PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  compliance_id uuid NULL REFERENCES compliance_master(id),
  title varchar(255) NOT NULL,
  description text NULL,
  frequency frequency_enum NOT NULL,
  due_date date NULL,
  assigned_to_user_id uuid NULL REFERENCES users(id),
  status varchar(30) NOT NULL DEFAULT 'OPEN',
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_tasks_branch ON compliance_tasks(branch_id);
CREATE INDEX IF NOT EXISTS idx_compliance_tasks_assigned_to ON compliance_tasks(assigned_to_user_id);

CREATE TABLE IF NOT EXISTS compliance_comments (
  id bigserial PRIMARY KEY,
  task_id bigint NOT NULL REFERENCES compliance_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compliance_evidence (
  id bigserial PRIMARY KEY,
  task_id bigint NOT NULL REFERENCES compliance_tasks(id) ON DELETE CASCADE,
  uploaded_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name varchar(255) NOT NULL,
  file_path text NOT NULL,
  mime_type varchar(120) NULL,
  remarks text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------
-- AUDITS
-- ------------------

CREATE TABLE IF NOT EXISTS audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  branch_id uuid NULL REFERENCES branches(id) ON DELETE SET NULL,
  auditor_user_id uuid NOT NULL REFERENCES users(id),
  contractor_user_id uuid NULL REFERENCES users(id),
  audit_type audit_type_enum NOT NULL,
  frequency frequency_enum NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'OPEN',
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audits_client ON audits(client_id);
CREATE INDEX IF NOT EXISTS idx_audits_branch ON audits(branch_id);

-- ------------------
-- NOTIFICATIONS
-- ------------------

CREATE TABLE IF NOT EXISTS notification_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(255) NOT NULL,
  query_type varchar(50) NOT NULL,
  priority varchar(20) NOT NULL DEFAULT 'NORMAL',
  status varchar(20) NOT NULL DEFAULT 'OPEN',
  from_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id uuid NULL REFERENCES clients(id) ON DELETE SET NULL,
  branch_id uuid NULL REFERENCES branches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_threads_to ON notification_threads(to_user_id);

CREATE TABLE IF NOT EXISTS notification_messages (
  id bigserial PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES notification_threads(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message text NOT NULL,
  attachment_path text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------
-- USER DELETION REQUEST / APPROVALS (CEO workflow)
-- ------------------

CREATE TABLE IF NOT EXISTS deletion_requests (
  id bigserial PRIMARY KEY,
  entity_type varchar(50) NOT NULL,
  entity_id uuid NOT NULL,
  requested_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  required_approver_role varchar(30) NOT NULL,
  required_approver_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  remarks text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON deletion_requests(status);

CREATE TABLE IF NOT EXISTS approvals (
  id bigserial PRIMARY KEY,
  entity_type varchar(50) NOT NULL,
  entity_id uuid NOT NULL,
  action varchar(30) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  remarks text NULL,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_to uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deletion_audit (
  id bigserial PRIMARY KEY,
  entity_type varchar(50) NOT NULL,
  entity_id uuid NOT NULL,
  performed_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  remarks text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
