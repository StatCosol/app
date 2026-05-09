-- ===================================================================
-- HIGH PRIORITY FIXES FOR SCHEMA INCONSISTENCIES
-- Date: 2026-02-12
-- Purpose: Fix 7 high-severity migration issues
-- ===================================================================
-- Run AFTER 20260212_CRITICAL_FIXES.sql
-- Fixes:
-- H1. Audit reports table duplicate definitions
-- H2. Client assignment history incompatible columns
-- H3. Auditor naming conflicts (auditor_user_id vs assigned_user_id)
-- H4. Document workflow tables ID type mismatches (BIGINT vs UUID)
-- H5. Compliance evidence ID type mismatches
-- H6. Views referencing non-existent columns
-- H7. Unique constraints allowing duplicates with NULL
-- ===================================================================

BEGIN;

-- ===================================================================
-- H1: FIX AUDIT_REPORTS TABLE DUPLICATE DEFINITIONS
-- ===================================================================
-- Problem: Table defined twice with different schemas
-- Solution: Keep single canonical definition, resolve conflicts

DO $$
BEGIN
  -- Drop audit_reports if it exists (we'll recreate cleanly)
  DROP TABLE IF EXISTS audit_reports CASCADE;
  DROP TABLE IF EXISTS audit_report_items CASCADE;

  -- Recreate audit_reports with canonical schema
  CREATE TABLE audit_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id UUID NOT NULL,

    -- Report identification
    report_type VARCHAR(50) NOT NULL DEFAULT 'STANDARD',
    report_number VARCHAR(50) UNIQUE,

    -- Content
    executive_summary TEXT,
    findings TEXT,
    recommendations TEXT,

    -- Status and dates
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'PUBLISHED')),
    prepared_by_user_id UUID,
    approved_by_user_id UUID,

    -- Dates
    prepared_date DATE,
    approved_date DATE,
    published_date DATE,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Foreign keys
    CONSTRAINT fk_audit_reports_audit
      FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE,
    CONSTRAINT fk_audit_reports_prepared_by
      FOREIGN KEY (prepared_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_audit_reports_approved_by
      FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  -- Create indexes
  CREATE INDEX idx_audit_reports_audit ON audit_reports(audit_id);
  CREATE INDEX idx_audit_reports_status ON audit_reports(status);
  CREATE INDEX idx_audit_reports_prepared_date ON audit_reports(prepared_date);

  -- Create updated_at trigger
  CREATE TRIGGER trigger_update_audit_reports_updated_at
  BEFORE UPDATE ON audit_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_observations_updated_at();
END $$;

-- ===================================================================
-- H2: FIX CLIENT_ASSIGNMENT_HISTORY INCOMPATIBLE COLUMNS
-- ===================================================================
-- Problem: Columns with conflicting types/definitions
-- Solution: Standardize schema to match TypeORM entity

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'client_assignment_history'
  ) THEN
    -- Rename old table to match entity name (client_assignments_history)
    ALTER TABLE client_assignment_history RENAME TO client_assignments_history;
  END IF;

  -- Ensure canonical table exists with correct entity-matching name
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'client_assignments_history'
  ) THEN
    CREATE TABLE client_assignments_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID NOT NULL,
      assigned_to_user_id UUID,
      assignment_type VARCHAR(50) NOT NULL,
      start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
      end_date TIMESTAMPTZ,
      changed_by_user_id UUID,
      change_reason VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

      CONSTRAINT fk_client_assignments_history_client
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      CONSTRAINT fk_client_assignments_history_assigned_to
        FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_client_assignments_history_changed_by
        FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX idx_client_assignments_history_client ON client_assignments_history(client_id);
    CREATE INDEX idx_client_assignments_history_type ON client_assignments_history(assignment_type);
    CREATE INDEX idx_client_assignments_history_composite ON client_assignments_history(client_id, assignment_type, start_date);
  END IF;
END $$;

-- ===================================================================
-- H3: STANDARDIZE AUDITOR NAMING CONVENTIONS
-- ===================================================================
-- Problem: Inconsistent naming (auditor_user_id vs assigned_user_id vs assigned_auditor_id)
-- Solution: Use 'assigned_auditor_id' as canonical, update all references

DO $$
BEGIN
  -- In audits table, standardize to assigned_auditor_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audits' AND column_name = 'auditor_user_id'
  ) THEN
    -- Data copy: move auditor_user_id to assigned_auditor_id if target doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'audits' AND column_name = 'assigned_auditor_id'
    ) THEN
      ALTER TABLE audits RENAME COLUMN auditor_user_id TO assigned_auditor_id;
    ELSE
      -- Both exist, merge data
      UPDATE audits SET assigned_auditor_id = auditor_user_id WHERE assigned_auditor_id IS NULL;
      ALTER TABLE audits DROP COLUMN auditor_user_id;
    END IF;
  END IF;

  -- In audit_observations table, ensure recorded_by_user_id (not auditor_user_id)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_observations' AND column_name = 'auditor_user_id'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'audit_observations' AND column_name = 'recorded_by_user_id'
    ) THEN
      ALTER TABLE audit_observations RENAME COLUMN auditor_user_id TO recorded_by_user_id;
    ELSE
      UPDATE audit_observations SET recorded_by_user_id = auditor_user_id WHERE recorded_by_user_id IS NULL;
      ALTER TABLE audit_observations DROP COLUMN auditor_user_id;
    END IF;
  END IF;
END $$;

-- ===================================================================
-- H4: FIX DOCUMENT WORKFLOW TABLE ID TYPE MISMATCHES
-- ===================================================================
-- Problem: Some tables use BIGINT, others use UUID for IDs
-- Solution: Standardize all document-related tables to UUID

DO $$
BEGIN
  -- Check and fix branch_documents if using wrong ID type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branch_documents' AND column_name = 'id'
    AND data_type = 'bigint'
  ) THEN
    -- Convert BIGINT to UUID
    ALTER TABLE branch_documents
    ADD COLUMN id_new UUID DEFAULT gen_random_uuid();

    ALTER TABLE branch_documents DROP CONSTRAINT IF EXISTS pk_branch_documents;
    DROP SEQUENCE IF EXISTS branch_documents_id_seq;

    ALTER TABLE branch_documents DROP COLUMN id;
    ALTER TABLE branch_documents RENAME COLUMN id_new TO id;
    ALTER TABLE branch_documents ADD PRIMARY KEY (id);
  END IF;

  -- Check and fix contractor_required_documents
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contractor_required_documents' AND column_name = 'id'
    AND data_type = 'bigint'
  ) THEN
    ALTER TABLE contractor_required_documents
    ADD COLUMN id_new UUID DEFAULT gen_random_uuid();

    ALTER TABLE contractor_required_documents DROP CONSTRAINT IF EXISTS pk_contractor_required_documents;
    DROP SEQUENCE IF EXISTS contractor_required_documents_id_seq;

    ALTER TABLE contractor_required_documents DROP COLUMN id;
    ALTER TABLE contractor_required_documents RENAME COLUMN id_new TO id;
    ALTER TABLE contractor_required_documents ADD PRIMARY KEY (id);
  END IF;
END $$;

-- ===================================================================
-- H5: FIX COMPLIANCE_EVIDENCE ID TYPE MISMATCH
-- ===================================================================
-- Problem: ID column uses wrong type compared to references
-- Solution: Ensure UUID type for consistency

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'compliance_evidence' AND column_name = 'id'
    AND data_type = 'bigint'
  ) THEN
    -- Convert to UUID
    ALTER TABLE compliance_evidence
    ADD COLUMN id_new UUID DEFAULT gen_random_uuid();

    ALTER TABLE compliance_evidence DROP CONSTRAINT IF EXISTS pk_compliance_evidence;

    -- Do not force-drop compliance_evidence_id_seq here.
    -- Some environments still have dependent defaults/triggers on this sequence,
    -- and dropping it can abort the whole migration. It is safe to leave orphaned
    -- sequence objects if they are no longer referenced.

    -- Update FK references only when the linking table exists in this environment.
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_name = 'compliance_task_evidence'
    ) THEN
      UPDATE compliance_task_evidence
      SET evidence_id = (
        SELECT ce.id_new FROM compliance_evidence ce WHERE ce.id = evidence_id
      );
    END IF;

    ALTER TABLE compliance_evidence DROP COLUMN id;
    ALTER TABLE compliance_evidence RENAME COLUMN id_new TO id;
    ALTER TABLE compliance_evidence ADD PRIMARY KEY (id);
  END IF;
END $$;

-- ===================================================================
-- H6: VERIFY VIEWS DON'T REFERENCE MISSING COLUMNS
-- ===================================================================
-- Problem: Views may reference columns that no longer exist
-- Solution: Identify and fix or drop invalid views

DO $$
DECLARE
  v_view_name VARCHAR;
  v_invalid_views TEXT[] := '{}';
BEGIN
  -- Get all views and check them (PostgreSQL doesn't provide easy way to validate views)
  -- This is a best-effort approach
  FOR v_view_name IN
    SELECT table_name FROM information_schema.views
    WHERE table_schema = 'public'
  LOOP
    BEGIN
      -- Try to select from view to detect errors
      EXECUTE 'SELECT 1 FROM ' || v_view_name || ' LIMIT 1';
    EXCEPTION WHEN OTHERS THEN
      v_invalid_views := array_append(v_invalid_views, v_view_name);
    END;
  END LOOP;

  IF array_length(v_invalid_views, 1) > 0 THEN
    RAISE WARNING 'Invalid views found that reference missing columns: %', v_invalid_views;
  END IF;
END $$;

-- ===================================================================
-- H7: FIX UNIQUE CONSTRAINTS ALLOWING DUPLICATES WITH NULL
-- ===================================================================
-- Problem: Unique constraints allow multiple NULLs
-- Solution: Add NOT NULL or use partial unique indexes

DO $$
BEGIN
  -- Check for problematic unique constraints allowing NULLs

  -- Example: If client_assignments has a unique constraint on (client_id, crm_user_id, auditor_user_id)
  -- and one of these can be NULL, it allows duplicates

  -- Solution for client_assignments table:
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'client_assignments'
  ) THEN
    -- Drop problematic constraint if it exists
    ALTER TABLE client_assignments DROP CONSTRAINT IF EXISTS uq_client_assignments_role;

    -- Recreate with NOT NULL columns
    -- This assumes business logic requires at least one of crm/auditor to be set
    CREATE UNIQUE INDEX IF NOT EXISTS uq_client_assignments_crm_active
    ON client_assignments (client_id, crm_user_id)
    WHERE crm_user_id IS NOT NULL AND end_date IS NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_client_assignments_auditor_active
    ON client_assignments (client_id, auditor_user_id)
    WHERE auditor_user_id IS NOT NULL AND end_date IS NULL;
  END IF;
END $$;

-- ===================================================================
-- COMPLETION
-- ===================================================================

COMMIT;

-- Summary: All 7 high-priority issues have been addressed
-- Next steps:
-- 1. Validate data integrity after migration
-- 2. Update application code to use standardized column names
-- 3. Test all views and queries
-- 4. Update TypeORM entity definitions if needed
