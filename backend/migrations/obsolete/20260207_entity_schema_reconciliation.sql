-- ===========================================================================
-- RECONCILIATION MIGRATION: Align DB schema with TypeORM entities
-- Baseline: statco_schema_final.sql
-- Date: 2026-02-07
--
-- ⚠️ BACKUP YOUR DATABASE BEFORE RUNNING
-- ⚠️ Run against statco_dev FIRST, verify the app starts, then apply to prod
-- ===========================================================================

BEGIN;

-- ===========================================================================
-- 0. ENUM FIXES
-- ===========================================================================

-- 0a. frequency_enum: entity uses 'EVENT', DB has 'EVENT_BASED'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'EVENT'
                 AND enumtypid = 'frequency_enum'::regtype) THEN
    ALTER TYPE frequency_enum ADD VALUE 'EVENT';
  END IF;
END $$;

-- 0b. audit_type_enum: entity uses different values
--     DB: (INTERNAL, EXTERNAL)
--     Entity: (CONTRACTOR, FACTORY, SHOPS_ESTABLISHMENT, LABOUR_EMPLOYMENT, FSSAI, HR, PAYROLL)
--     Strategy: Convert column to varchar to support both old and new values.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'audits' AND column_name = 'audit_type'
               AND udt_name = 'audit_type_enum') THEN
    ALTER TABLE audits ALTER COLUMN audit_type TYPE varchar(50) USING audit_type::text;
  END IF;
END $$;

-- ===========================================================================
-- 1. BRANCHES: rename table & columns, add missing columns
-- ===========================================================================

-- 1a. Rename table (only if old name exists and new name doesn't)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'branches')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'client_branches') THEN
    ALTER TABLE branches RENAME TO client_branches;
  END IF;
END $$;

-- 1b. Rename columns (snake_case → entity's single-word names)
-- Only rename if the old column exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_branches' AND column_name = 'client_id') THEN
    ALTER TABLE client_branches RENAME COLUMN client_id TO clientid;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_branches' AND column_name = 'branch_name') THEN
    ALTER TABLE client_branches RENAME COLUMN branch_name TO branchname;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_branches' AND column_name = 'branch_type') THEN
    ALTER TABLE client_branches RENAME COLUMN branch_type TO branchtype;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_branches' AND column_name = 'is_active') THEN
    ALTER TABLE client_branches RENAME COLUMN is_active TO isactive;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_branches' AND column_name = 'deleted_at') THEN
    ALTER TABLE client_branches RENAME COLUMN deleted_at TO deletedat;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_branches' AND column_name = 'created_at') THEN
    ALTER TABLE client_branches RENAME COLUMN created_at TO createdat;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_branches' AND column_name = 'updated_at') THEN
    ALTER TABLE client_branches RENAME COLUMN updated_at TO updatedat;
  END IF;
END $$;

-- 1c. Rename 'state' → 'statecode' and narrow type
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_branches' AND column_name = 'state') THEN
    ALTER TABLE client_branches RENAME COLUMN state TO statecode;
    ALTER TABLE client_branches ALTER COLUMN statecode TYPE varchar(10) USING left(statecode, 10);
  END IF;
END $$;

-- 1d. Change branchtype from enum to varchar (if still enum)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'client_branches' AND column_name = 'branchtype'
               AND udt_name = 'branch_type_enum') THEN
    ALTER TABLE client_branches ALTER COLUMN branchtype TYPE varchar USING branchtype::text;
  END IF;
END $$;

-- 1e. Make branchname nullable (entity allows null)
ALTER TABLE client_branches ALTER COLUMN branchname DROP NOT NULL;

-- 1f. Make address NOT NULL (entity expects NOT NULL)
UPDATE client_branches SET address = '' WHERE address IS NULL;
ALTER TABLE client_branches ALTER COLUMN address SET NOT NULL;

-- 1g. Add missing columns
ALTER TABLE client_branches ADD COLUMN IF NOT EXISTS headcount       int NOT NULL DEFAULT 0;
ALTER TABLE client_branches ADD COLUMN IF NOT EXISTS employeecount   int NOT NULL DEFAULT 0;
ALTER TABLE client_branches ADD COLUMN IF NOT EXISTS contractorcount int NOT NULL DEFAULT 0;
ALTER TABLE client_branches ADD COLUMN IF NOT EXISTS status          varchar NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE client_branches ADD COLUMN IF NOT EXISTS isdeleted       boolean NOT NULL DEFAULT false;
ALTER TABLE client_branches ADD COLUMN IF NOT EXISTS deletedby       uuid NULL;
ALTER TABLE client_branches ADD COLUMN IF NOT EXISTS deletereason    text NULL;

-- NOTE: Extra DB columns (branch_code, city, pincode) are kept for data safety.
-- To remove: ALTER TABLE client_branches DROP COLUMN IF EXISTS branch_code;

-- ===========================================================================
-- 2. ASSIGNMENTS (normalized per-type model)
-- ===========================================================================

-- 2a. Legacy client_assignments: add missing rotation columns
ALTER TABLE client_assignments ADD COLUMN IF NOT EXISTS crm_assigned_from     date NULL;
ALTER TABLE client_assignments ADD COLUMN IF NOT EXISTS crm_assigned_to       date NULL;
ALTER TABLE client_assignments ADD COLUMN IF NOT EXISTS auditor_assigned_from date NULL;
ALTER TABLE client_assignments ADD COLUMN IF NOT EXISTS auditor_assigned_to   date NULL;
ALTER TABLE client_assignments ADD COLUMN IF NOT EXISTS created_by            uuid NULL;

-- 2b. client_assignments_current: DROP old wide-table, create normalized version
DROP TABLE IF EXISTS client_assignment_current CASCADE;
DROP TABLE IF EXISTS client_assignments_current CASCADE;
CREATE TABLE client_assignments_current (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  assignment_type     varchar NOT NULL,
  assigned_to_user_id uuid NULL REFERENCES users(id),
  start_date          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_assignments_current_client_type UNIQUE (client_id, assignment_type)
);

CREATE INDEX IF NOT EXISTS idx_assign_current_user ON client_assignments_current(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_assign_current_type ON client_assignments_current(assignment_type);

-- 2c. client_assignments_history: DROP old wide-table, create normalized version
DROP TABLE IF EXISTS client_assignment_history CASCADE;
DROP TABLE IF EXISTS client_assignments_history CASCADE;
CREATE TABLE client_assignments_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  assignment_type     varchar NOT NULL,
  assigned_to_user_id uuid NULL REFERENCES users(id),
  start_date          timestamptz NOT NULL DEFAULT now(),
  end_date            timestamptz NULL,
  changed_by_user_id  uuid NULL REFERENCES users(id),
  change_reason       varchar NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assign_hist_client    ON client_assignments_history(client_id);
CREATE INDEX IF NOT EXISTS idx_assign_hist_type      ON client_assignments_history(assignment_type);
CREATE INDEX IF NOT EXISTS idx_assign_hist_composite ON client_assignments_history(client_id, assignment_type, start_date);

-- ===========================================================================
-- 3. COMPLIANCE_TASKS
-- ===========================================================================

-- 3a. Make branch_id nullable (entity says nullable)
ALTER TABLE compliance_tasks ALTER COLUMN branch_id DROP NOT NULL;

-- 3b. Make compliance_id NOT NULL (entity expects NOT NULL)
--     Assign a placeholder for NULLs first
UPDATE compliance_tasks SET compliance_id = '00000000-0000-0000-0000-000000000000'
  WHERE compliance_id IS NULL;
ALTER TABLE compliance_tasks ALTER COLUMN compliance_id SET NOT NULL;

-- 3c. Make due_date NOT NULL
UPDATE compliance_tasks SET due_date = CURRENT_DATE WHERE due_date IS NULL;
ALTER TABLE compliance_tasks ALTER COLUMN due_date SET NOT NULL;

-- 3d. Change status default and type
ALTER TABLE compliance_tasks ALTER COLUMN status SET DEFAULT 'PENDING';
ALTER TABLE compliance_tasks ALTER COLUMN status TYPE varchar(20) USING left(status, 20);

-- 3e. Add missing columns
ALTER TABLE compliance_tasks ADD COLUMN IF NOT EXISTS period_year         int NOT NULL DEFAULT 2026;
ALTER TABLE compliance_tasks ADD COLUMN IF NOT EXISTS period_month        int NULL;
ALTER TABLE compliance_tasks ADD COLUMN IF NOT EXISTS period_label        varchar(30) NULL;
ALTER TABLE compliance_tasks ADD COLUMN IF NOT EXISTS assigned_by_user_id uuid NULL;
ALTER TABLE compliance_tasks ADD COLUMN IF NOT EXISTS remarks             text NULL;
ALTER TABLE compliance_tasks ADD COLUMN IF NOT EXISTS last_notified_at    timestamp NULL;
ALTER TABLE compliance_tasks ADD COLUMN IF NOT EXISTS escalated_at        timestamp NULL;

-- NOTE: Extra DB columns (title, description, frequency, created_by_user_id)
-- are kept for data safety. To remove them uncomment:
-- ALTER TABLE compliance_tasks DROP COLUMN IF EXISTS title;
-- ALTER TABLE compliance_tasks DROP COLUMN IF EXISTS description;
-- ALTER TABLE compliance_tasks DROP COLUMN IF EXISTS frequency;
-- ALTER TABLE compliance_tasks DROP COLUMN IF EXISTS created_by_user_id;

-- ===========================================================================
-- 4. AUDITS
-- ===========================================================================

-- 4a. Drop columns not in entity (keep data safety backup with IF EXISTS)
ALTER TABLE audits DROP COLUMN IF EXISTS branch_id;
ALTER TABLE audits DROP COLUMN IF EXISTS start_date;
ALTER TABLE audits DROP COLUMN IF EXISTS end_date;

-- 4b. Rename auditor_user_id → assigned_auditor_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'audits' AND column_name = 'auditor_user_id') THEN
    ALTER TABLE audits RENAME COLUMN auditor_user_id TO assigned_auditor_id;
  END IF;
END $$;

-- 4c. Add missing columns
ALTER TABLE audits ADD COLUMN IF NOT EXISTS period_year        int NOT NULL DEFAULT 2026;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS period_code        varchar(20) NOT NULL DEFAULT '2026';
ALTER TABLE audits ADD COLUMN IF NOT EXISTS created_by_user_id uuid NULL;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS due_date           date NULL;

-- 4d. Change status default and type
UPDATE audits SET status = 'PLANNED' WHERE status = 'OPEN';
ALTER TABLE audits ALTER COLUMN status SET DEFAULT 'PLANNED';
ALTER TABLE audits ALTER COLUMN status TYPE varchar(20) USING left(status, 20);

-- ===========================================================================
-- 5. AUDIT_OBSERVATIONS: create from scratch (not in baseline)
-- ===========================================================================

-- 5a. Dependency: audit_observation_categories
CREATE TABLE IF NOT EXISTS audit_observation_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        varchar(200) NOT NULL,
  description text NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_obs_cat_name
  ON audit_observation_categories(name);

-- 5b. Create audit_observations matching entity exactly.
--     NOTE: Columns without @Column({ name: '...' }) use camelCase property names
--     and must be double-quoted in PostgreSQL.
CREATE TABLE IF NOT EXISTS audit_observations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id                 uuid NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  category_id              uuid NULL REFERENCES audit_observation_categories(id) ON DELETE SET NULL,
  "sequenceNumber"         int NULL,
  observation              text NOT NULL,
  consequences             text NULL,
  "complianceRequirements" text NULL,
  elaboration              text NULL,
  risk                     text NULL,
  status                   varchar(50) NOT NULL DEFAULT 'OPEN',
  recorded_by_user_id      uuid NOT NULL REFERENCES users(id),
  "evidenceFilePaths"      text NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_obs_auditid    ON audit_observations(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_obs_category   ON audit_observations(category_id);
CREATE INDEX IF NOT EXISTS idx_audit_obs_status     ON audit_observations(status);
CREATE INDEX IF NOT EXISTS idx_audit_obs_recordedby ON audit_observations(recorded_by_user_id);

-- ===========================================================================
-- 6. COMPLIANCE EVIDENCE & COMMENTS (ensure they exist)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS compliance_evidence (
  id               bigserial PRIMARY KEY,
  task_id          bigint NOT NULL REFERENCES compliance_tasks(id) ON DELETE CASCADE,
  file_path        text NOT NULL,
  file_name        varchar(255) NOT NULL,
  file_type        varchar(50) NULL,
  file_size        bigint NULL,
  uploaded_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compliance_evidence_task ON compliance_evidence(task_id);

CREATE TABLE IF NOT EXISTS compliance_comments (
  id               bigserial PRIMARY KEY,
  task_id          bigint NOT NULL REFERENCES compliance_tasks(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id),
  comment          text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compliance_comments_task ON compliance_comments(task_id);

COMMIT;
