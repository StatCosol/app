# SQL Schema Migration Analysis Report
**Date:** 2026-02-12
**Project:** Statco Backend Database
**Scope:** Complete analysis of migration files (20260127 - 20260212)

---

## Executive Summary

**Total Issues Found: 23**
- **CRITICAL: 8** - Blocking schema inconsistencies
- **HIGH: 7** - Significant foreign key/constraint violations
- **MEDIUM: 5** - Data type mismatches and naming conflicts
- **LOW: 3** - Index redundancy and optimization issues

The migration history shows significant schema evolution with multiple conflicting patterns. Most critical issues stem from competing migration strategies (governance model vs entity reconciliation) that were applied sequentially without full rollback of previous changes.

---

## 1. CRITICAL ISSUES

### Issue #1: Audit Observations Table - Duplicate Column Definitions
**Severity:** CRITICAL
**Location:** Multiple migrations (20260205_audit_observations.sql, 20260207_fix_audit_type_enum.sql, 20260207_entity_schema_reconciliation.sql)
**Files:**
- `20260205_audit_observations.sql` (lines 1-46)
- `20260207_fix_audit_type_enum.sql` (lines 54-69)
- `20260207_entity_schema_reconciliation.sql` (lines 245-260)

**Problem:**
Three separate migrations attempt to create the `audit_observations` table with incompatible column definitions:

1. **20260205_audit_observations.sql** creates:
   - `sequence_number INT`
   - `observation TEXT NOT NULL`
   - `status VARCHAR(50)` with CHECK constraint
   - `recorded_by_user_id UUID NOT NULL`
   - `evidence_file_paths TEXT` (JSON array)

2. **20260207_fix_audit_type_enum.sql** creates:
   - `"sequenceNumber" INT NULL` (camelCase)
   - Same columns but different nullability

3. **20260207_entity_schema_reconciliation.sql** creates:
   - Double-quoted column names (`"sequenceNumber"`, `"complianceRequirements"`, `"evidenceFilePaths"`)
   - Same logical columns but different naming conventions

**Impact:**
- Column name conflicts between migrations
- TypeORM entity mapping will fail due to snake_case vs camelCase mismatch
- Database queries will use wrong column names

**Root Cause:** Entity schema uses camelCase while migrations use snake_case. The reconciliation migration attempts to fix this but applies after earlier migrations already created snake_case columns.

**Recommended Fix:**
```sql
-- Drop audit_observations and dependencies
DROP TABLE IF EXISTS audit_observations CASCADE;
DROP TABLE IF EXISTS audit_observation_categories CASCADE;

-- Create single canonical table with TypeORM entity mapping
CREATE TABLE audit_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  category_id UUID NULL REFERENCES audit_observation_categories(id) ON DELETE SET NULL,
  "sequenceNumber" INT NULL,
  observation TEXT NOT NULL,
  consequences TEXT NULL,
  "complianceRequirements" TEXT NULL,
  elaboration TEXT NULL,
  risk TEXT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  recorded_by_user_id UUID NOT NULL REFERENCES users(id),
  "evidenceFilePaths" TEXT[] NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

### Issue #2: Branch Table Naming Conflict
**Severity:** CRITICAL
**Location:** `20260207_entity_schema_reconciliation.sql` (lines 42-49)
**Files:**
- `20260206_governance_model_complete_schema.sql` (creates `branches`)
- `20260207_entity_schema_reconciliation.sql` (renames to `client_branches`)

**Problem:**
The governance schema creates a `branches` table, but the entity reconciliation migration attempts to rename it to `client_branches`. However, the rename uses conditional logic that may fail silently:

```sql
-- Line 45-49
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'branches')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'client_branches') THEN
    ALTER TABLE branches RENAME TO client_branches;
  END IF;
END $$;
```

**Impact:**
- If `client_branches` already exists from a previous run, the rename silently fails
- Code references `branches` table will break if rename succeeds
- Foreign keys in `client_branches` table reference `branches(id)` but the table may have been renamed

**Evidence of Issue:**
From `20260206_governance_model_complete_schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ...
);
```

But foreign keys in other tables reference `client_branches`:
- `branch_documents` (line 22): `REFERENCES client_branches(id)`
- `branch_auditor_assignments` (line 8): `REFERENCES client_branches(id)`
- `contractor_required_documents` (line 11): `REFERENCES client_branches(id)`

**Recommended Fix:**
- Rename all `client_branches` references back to `branches` in newer migrations
- OR rename `branches` to `client_branches` in governance schema
- Update all dependent table ForeignKey constraints to use consistent name

---

### Issue #3: Notification Reads Foreign Key Violation
**Severity:** CRITICAL
**Location:** `20260201_notification_reads.sql` (lines 11-12)
**File:** `20260201_notification_reads.sql`

**Problem:**
The migration creates a foreign key constraint to a non-existent table:

```sql
CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id uuid NOT NULL,
  ...
  CONSTRAINT fk_notification_reads_notification
    FOREIGN KEY (notification_id) REFERENCES notification_threads(id) ON DELETE CASCADE
);
```

But the schema does NOT define a `notification_threads` table. The governance schema defines `notifications` table instead.

**Impact:**
- Cannot create notification_reads table due to missing referenced table
- Application code expecting `notification_threads` will fail
- Migration will error on execution if `notification_threads` doesn't exist

**Evidence:**
- `20260206_governance_model_complete_schema.sql` creates `notifications` table (line 136)
- `20260201_notification_reads.sql` expects `notification_threads` table
- No migration creates `notification_threads` table

**Recommended Fix:**
```sql
-- Update foreign key to reference correct table
ALTER TABLE notification_reads DROP CONSTRAINT fk_notification_reads_notification;
ALTER TABLE notification_reads ADD CONSTRAINT fk_notification_reads_notification
  FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE;
```

---

### Issue #4: Audit Table - Conflicting Column Operations
**Severity:** CRITICAL
**Location:** Multiple migrations affecting `audits` table
**Files:**
- `20260205_fix_audits_schema.sql` (adds columns)
- `20260207_fix_audit_type_enum.sql` (drops columns)
- `20260207_entity_schema_reconciliation.sql` (drops same columns again)

**Problem:**
Sequential migrations add and then drop columns from `audits` table inconsistently:

1. **20260205_fix_audits_schema.sql** (lines 8-10):
   ```sql
   ALTER TABLE audits ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
   ALTER TABLE audits ADD COLUMN IF NOT EXISTS start_date DATE;
   ALTER TABLE audits ADD COLUMN IF NOT EXISTS end_date DATE;
   ```

2. **20260207_fix_audit_type_enum.sql** (lines 36-38):
   ```sql
   ALTER TABLE audits DROP COLUMN IF EXISTS branch_id;
   ALTER TABLE audits DROP COLUMN IF EXISTS start_date;
   ALTER TABLE audits DROP COLUMN IF EXISTS end_date;
   ```

3. **20260207_entity_schema_reconciliation.sql** (lines 204-206):
   ```sql
   ALTER TABLE audits DROP COLUMN IF EXISTS branch_id;
   ALTER TABLE audits DROP COLUMN IF EXISTS start_date;
   ALTER TABLE audits DROP COLUMN IF EXISTS end_date;
   ```

**Impact:**
- Data loss if columns were populated before drop
- Queries/triggers referencing these columns will fail
- Audit branch tracking capability is lost
- No clear specification of what columns should exist

**Root Cause:** Two competing migration strategies applied without coordination:
1. Governance model adds audit columns for tracking branch
2. Entity reconciliation removes them because TypeORM entity doesn't include them

**Recommended Fix:**
Decide final schema and enforce single source of truth:

Option A - Keep branch tracking:
```sql
ALTER TABLE audits ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE audits ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS end_date DATE;
-- Update TypeORM entity to include these fields
```

Option B - Remove branch tracking (current approach):
```sql
-- Accept column drops, ensure no application code references these columns
-- Document that branch tracking is removed from audit table
```

---

### Issue #5: Audit_type Column Type Conversion Race Condition
**Severity:** CRITICAL
**Location:** `20260207_fix_audit_type_enum.sql` (lines 4-15)
**Files:**
- `20260206_governance_model_complete_schema.sql` (creates as TEXT)
- `20260207_fix_audit_type_enum.sql` (converts enum to varchar)

**Problem:**
The migration contains conditional type conversion logic that may not be idempotent:

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'audits' AND column_name = 'audit_type'
               AND udt_name = 'audit_type_enum') THEN
    ALTER TABLE audits ALTER COLUMN audit_type TYPE varchar(50) USING audit_type::text;
    RAISE NOTICE 'Converted audits.audit_type from enum to varchar(50)';
  ELSE
    RAISE NOTICE 'audits.audit_type is already varchar — no change needed';
  END IF;
END $$;
```

**Impact:**
- If migration is re-run and column is already varchar, conversion skips
- No way to verify schema consistency across environments
- Concurrent migrations could cause deadlocks during conversion

**Recommended Fix:**
```sql
-- Use explicit type checking and safe conversion
ALTER TABLE audits ALTER COLUMN audit_type TYPE varchar(50);
-- Add CHECK constraint for valid values
ALTER TABLE audits ADD CONSTRAINT chk_audit_type
  CHECK (audit_type IN ('CONTRACTOR', 'FACTORY', 'SHOPS_ESTABLISHMENT',
                        'LABOUR_EMPLOYMENT', 'FSSAI', 'HR', 'PAYROLL',
                        'STATUTORY', 'INTERNAL', 'CLIENT_SPECIFIC'));
```

---

### Issue #6: Uuid Function Name - PostgreSQL Version Compatibility
**Severity:** CRITICAL
**Location:** `20260212_legitx_compliance_returns_audit_reports.sql` (lines 5, 30)
**File:** `20260212_legitx_compliance_returns_audit_reports.sql`

**Problem:**
The migration uses `uuid_generate_v4()` which requires the `uuid-ossp` extension, but other migrations use `gen_random_uuid()` which is native to PostgreSQL 13+:

```sql
-- Line 5 - NEW migration uses old function
CREATE TABLE IF NOT EXISTS compliance_returns (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ...
);

-- Line 30 - NEW migration uses old function
CREATE TABLE IF NOT EXISTS audit_reports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ...
);
```

But all other migrations use:
```sql
-- All other migrations use modern function
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
```

**Impact:**
- Migration fails if `uuid-ossp` extension not loaded
- Inconsistent UUID generation across tables
- Environment-dependent behavior (fails on systems without extension)

**Recommended Fix:**
```sql
-- Change all uuid_generate_v4() to gen_random_uuid()
CREATE TABLE IF NOT EXISTS compliance_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ...
);

CREATE TABLE IF NOT EXISTS audit_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ...
);
```

---

### Issue #7: Foreign Key Constraint Dangling Reference
**Severity:** CRITICAL
**Location:** `20260211_add_branch_auditor_assignments.sql` (line 22)
**File:** `20260211_add_branch_auditor_assignments.sql`

**Problem:**
Foreign key constraint references `client_branches` but this table is conditionally renamed:

```sql
CREATE TABLE IF NOT EXISTS branch_auditor_assignments (
  ...
  branch_id UUID NOT NULL REFERENCES client_branches(id) ON DELETE CASCADE,
  ...
);
```

Per issue #2, the governance schema creates `branches` but reconciliation conditionally renames to `client_branches`. If the rename doesn't execute, this FK constraint fails.

**Impact:**
- Migration fails with: "relation 'client_branches' does not exist"
- Cannot create branch auditor assignments
- Application feature for branch-wise auditor assignments broken

**Recommended Fix:**
Standardize table name across all migrations. Update all FK references in 20260211 migration to use single canonical name.

---

### Issue #8: Compliance Returns Foreign Key Mismatch
**Severity:** CRITICAL
**Location:** `20260212_legitx_compliance_returns_audit_reports.sql` (lines 4-22)
**File:** `20260212_legitx_compliance_returns_audit_reports.sql`

**Problem:**
The migration creates `compliance_returns` table referencing `clients` and `branches`:

```sql
CREATE TABLE IF NOT EXISTS compliance_returns (
  client_id uuid NOT NULL,
  branch_id uuid NULL,
  ...
);
```

But **NO foreign key constraints are defined**. This allows:
- Orphaned records pointing to non-existent clients/branches
- Cascade deletes won't work
- Data integrity violations

**Impact:**
- Data loss when clients/branches deleted (cascade doesn't work)
- Orphaned compliance returns records
- Queries to join compliance_returns with clients will be inefficient without constraints

**Evidence:** Lines 4-22 show table creation with FK columns but no CONSTRAINT definitions.

**Recommended Fix:**
```sql
-- Add missing FK constraints
ALTER TABLE compliance_returns
  ADD CONSTRAINT fk_comp_returns_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_comp_returns_branch
    FOREIGN KEY (branch_id) REFERENCES client_branches(id) ON DELETE SET NULL;
```

---

## 2. HIGH SEVERITY ISSUES

### Issue #9: Audit Reports Table - Duplicate Definition & Missing Constraints
**Severity:** HIGH
**Location:**
- `20260206_governance_model_complete_schema.sql` (lines 335-356)
- `20260212_legitx_compliance_returns_audit_reports.sql` (lines 29-38)

**Problem:**
The table is defined twice with different structures:

**First definition** (20260206):
```sql
CREATE TABLE IF NOT EXISTS audit_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  report_title TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);
```

**Second definition** (20260212):
```sql
CREATE TABLE IF NOT EXISTS audit_reports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  audit_id uuid NOT NULL,
  file_name varchar(255) NOT NULL,
  file_path text NOT NULL,
  uploaded_by_user_id uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  report_date date NULL,
  is_public boolean NOT NULL DEFAULT true
);
```

**Impact:**
- First migration's IF NOT EXISTS prevents second from creating its columns
- Missing columns: file_name, file_path, uploaded_by_user_id, is_public
- Missing FK constraint from 20260212: uploaded_by_user_id → users(id)
- Different defaults and naming conventions

**Recommended Fix:**
Merge both definitions into single comprehensive table:
```sql
CREATE TABLE IF NOT EXISTS audit_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  report_title TEXT,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',

  -- File tracking
  file_name VARCHAR(255),
  file_path TEXT,
  uploaded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  report_date DATE,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,

  -- Approval tracking
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,

  CONSTRAINT chk_report_status CHECK (status IN ('DRAFT', 'PENDING_SUBMISSION', 'SUBMITTED', 'APPROVED', 'REJECTED'))
);
```

---

### Issue #10: Client Assignment History Table - Column Mismatch
**Severity:** HIGH
**Location:** Multiple definitions
**Files:**
- `20260206_governance_model_complete_schema.sql` (lines 109-131)
- `20260207_entity_schema_reconciliation.sql` (lines 143-160)
- `20260207_migrate_client_assignments.sql` (lines 84-97)

**Problem:**
Three different definitions of assignment history with incompatible columns:

**First (20260206):**
```sql
CREATE TABLE IF NOT EXISTS client_assignment_history (
  client_id UUID NOT NULL,
  assignment_type TEXT NOT NULL,
  old_user_id UUID REFERENCES users(id),
  new_user_id UUID NOT NULL REFERENCES users(id),
  effective_date DATE NOT NULL,
  reason TEXT NOT NULL,
  changed_by_user_id UUID NOT NULL REFERENCES users(id)
);
```

**Second (20260207_entity_reconciliation):**
```sql
DROP TABLE IF EXISTS client_assignment_history CASCADE;
CREATE TABLE client_assignments_history (
  assignment_type varchar NOT NULL,
  assigned_to_user_id uuid NULL REFERENCES users(id),
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz NULL,
  changed_by_user_id uuid NULL REFERENCES users(id),
  change_reason varchar NULL
);
```

**Third (20260207_migrate):**
```sql
CREATE TABLE IF NOT EXISTS client_assignment_history (
  assignment_type TEXT NOT NULL,
  assigned_user_id UUID NOT NULL REFERENCES users(id),
  assigned_on DATE NOT NULL,
  ended_on DATE NOT NULL,
  ended_reason TEXT NOT NULL
);
```

**Impact:**
- Column names differ (new_user_id vs assigned_to_user_id vs assigned_user_id)
- Data types differ (DATE vs TIMESTAMPTZ)
- Migration drops and recreates table, losing history data
- Table may be named `client_assignments_history` or `client_assignment_history`

**Recommended Fix:**
Pick one canonical definition and enforce across all migrations:
```sql
DROP TABLE IF EXISTS client_assignment_history CASCADE;
DROP TABLE IF EXISTS client_assignments_history CASCADE;

CREATE TABLE client_assignment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  assignment_type VARCHAR(20) NOT NULL CHECK (assignment_type IN ('CRM', 'AUDITOR')),
  assigned_user_id UUID NOT NULL REFERENCES users(id),
  assigned_on DATE NOT NULL,
  ended_on DATE NULL,
  ended_reason VARCHAR(50) CHECK (ended_reason IN ('ROTATION', 'REPLACEMENT', 'TERMINATION')),
  changed_by_user_id UUID NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

### Issue #11: Branch Auditor Assignments - Naming Inconsistency
**Severity:** HIGH
**Location:** `20260211_add_branch_auditor_assignments.sql` (line 9)
**File:** `20260211_add_branch_auditor_assignments.sql`

**Problem:**
Column is named `auditor_user_id` but all other assignment tables use:
- `assigned_user_id` in new client_assignments
- `assigned_to_user_id` in reconciliation migration

```sql
CREATE TABLE IF NOT EXISTS branch_auditor_assignments (
  auditor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ...
);
```

**Impact:**
- Inconsistent naming makes queries and ORM mapping complex
- TypeORM entity fields won't align with column names
- Code must use different property names for different assignment types
- Foreign key constraint uses non-standard name

**Recommended Fix:**
Standardize to `assigned_user_id` across all assignment tables:
```sql
ALTER TABLE branch_auditor_assignments RENAME COLUMN auditor_user_id TO assigned_user_id;
```

---

### Issue #12: Document Workflow Tables - Document ID Type Mismatch
**Severity:** HIGH
**Location:** `20260209_audit_workflow_schema.sql`
**File:** `20260209_audit_workflow_schema.sql`

**Problem:**
Three tables use `document_id` as BIGINT without specifying which document table they reference:

```sql
-- Line 9 - Line 14
CREATE TABLE IF NOT EXISTS document_remarks (
  document_id bigint NOT NULL,  -- generic reference to any document table
  document_type varchar(50) NOT NULL,
  ...
);

-- Line 25
CREATE TABLE IF NOT EXISTS document_reupload_requests (
  document_id bigint NOT NULL,
  document_type varchar(50) NOT NULL,
  ...
);

-- Line 57
CREATE TABLE IF NOT EXISTS document_versions (
  document_id bigint NOT NULL,
  document_type varchar(50) NOT NULL,
  ...
);
```

But referenced document tables use UUID:
- `compliance_evidence.id` (20260207_entity_reconciliation.sql, line 272): `bigserial PRIMARY KEY`
- `contractor_documents.id` (20260127_hrms_phase1_schema.sql, line 216): `uuid PRIMARY KEY`
- `branch_documents.id` (20260210_branch_documents_and_establishment.sql, line 20): `UUID PRIMARY KEY`

**Impact:**
- Polymorphic document references cannot work with BIGINT when documents use UUID
- Foreign key constraints cannot be created (type mismatch)
- Queries joining on document_id will fail

**Evidence:**
- compliance_evidence uses BIGINT (line 272-273)
- contractor_documents uses UUID (line 216)
- branch_documents uses UUID (line 20)
- document workflow tables expect BIGINT (lines 9, 25, 57)

**Recommended Fix:**
Change document_id in workflow tables to UUID and add proper FK constraints:
```sql
ALTER TABLE document_remarks ALTER COLUMN document_id TYPE uuid;
ALTER TABLE document_reupload_requests ALTER COLUMN document_id TYPE uuid;
ALTER TABLE document_versions ALTER COLUMN document_id TYPE uuid;

-- Add constraint validation (note: polymorphic, so CHECK constraints needed)
ALTER TABLE document_remarks ADD CONSTRAINT chk_doc_remarks_type
  CHECK (document_type IN ('COMPLIANCE_EVIDENCE', 'CONTRACTOR_DOC', 'BRANCH_DOC'));
```

---

### Issue #13: Compliance Evidence ID Type Mismatch
**Severity:** HIGH
**Location:** `20260207_entity_schema_reconciliation.sql` (lines 271-281)
**File:** `20260207_entity_schema_reconciliation.sql`

**Problem:**
`compliance_evidence` table uses BIGSERIAL for ID:
```sql
CREATE TABLE IF NOT EXISTS compliance_evidence (
  id bigserial PRIMARY KEY,
  task_id bigint NOT NULL REFERENCES compliance_tasks(id) ON DELETE CASCADE,
  ...
);
```

But `compliance_tasks` uses UUID (per governance schema), causing type mismatch on FK constraint.

**Impact:**
- Foreign key constraint mismatch: bigint vs UUID
- Performance degradation using BIGINT with UUID parent
- Inconsistent ID scheme across tables

**Recommended Fix:**
```sql
-- Option 1: Use UUID in compliance_evidence (preferred)
DROP TABLE IF EXISTS compliance_evidence CASCADE;
CREATE TABLE compliance_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES compliance_tasks(id) ON DELETE CASCADE,
  ...
);

-- Option 2: Use BIGINT in compliance_tasks (not recommended)
-- Would require migrating all audit observations to BIGINT
```

---

### Issue #14: Reference to Non-existent Column in Views
**Severity:** HIGH
**Location:** `20260206_governance_model_complete_schema.sql` (line 400)
**File:** `20260206_governance_model_complete_schema.sql`

**Problem:**
The `admin_escalations_view` selects columns that may not exist:

```sql
-- Line 400
(CURRENT_DATE - ca.rotation_due_on) AS days_delayed,
ca.updated_at AS last_updated_at
FROM client_assignments ca
...
WHERE ca.status = 'ACTIVE'
  AND ca.rotation_due_on < CURRENT_DATE
```

But the `client_assignments` table in the reconciliation migration doesn't have `rotation_due_on` - it has `start_date` and `end_date` instead.

**Impact:**
- View creation will fail with "column does not exist" error
- Escalation queue for admin dashboard will be broken
- Exception handling in lines 434-435 will suppress the error

**Evidence:**
- Governance schema defines: assigned_on, rotation_due_on (lines 86-87)
- Reconciliation schema defines: start_date, end_date (lines 135, 152)

**Recommended Fix:**
Update view to reference correct columns:
```sql
-- Check which assignment table definition is canonical
-- Update view or migration to align column names
-- Ensure admin_escalations_view uses correct columns from final client_assignments structure
```

---

### Issue #15: Contractor Required Documents - Unique Constraint Issues
**Severity:** HIGH
**Location:** `20260210_contractor_required_documents.sql` (lines 24-25)
**File:** `20260210_contractor_required_documents.sql`

**Problem:**
Unique constraint allows duplicate records when branch_id is NULL:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_crd_contractor_branch_doc
  ON contractor_required_documents(contractor_id, branch_id, doc_type);
```

In PostgreSQL, NULL is not equal to NULL, so this allows multiple rows with:
- Same contractor_id
- Same doc_type
- NULL branch_id

**Impact:**
- Duplicate document requirements can be created
- Application logic expecting unique constraints will break
- Data quality issues in tracking required documents

**Recommended Fix:**
```sql
-- Use partial unique index for non-NULL branch_id
CREATE UNIQUE INDEX IF NOT EXISTS uq_crd_contractor_branch_doc_with_branch
  ON contractor_required_documents(contractor_id, branch_id, doc_type)
  WHERE branch_id IS NOT NULL;

-- Add separate constraint for NULL branch_id
CREATE UNIQUE INDEX IF NOT EXISTS uq_crd_contractor_no_branch_doc
  ON contractor_required_documents(contractor_id, doc_type)
  WHERE branch_id IS NULL;
```

---

## 3. MEDIUM SEVERITY ISSUES

### Issue #16: Evidence File Paths Data Type Inconsistency
**Severity:** MEDIUM
**Location:** Multiple migrations
**Files:**
- `20260205_audit_observations.sql` (line 19): `TEXT` (JSON array)
- `20260207_fix_audit_type_enum.sql` (line 64): `text[]` (array)
- `20260207_entity_schema_reconciliation.sql` (line 257): `TEXT` (nullable)

**Problem:**
Column used for storing evidence file paths has inconsistent data types across migrations:

1. TEXT (string containing JSON array)
2. TEXT[] (native PostgreSQL array)
3. TEXT NULL (nullable string)

**Impact:**
- Application code cannot reliably parse evidence paths
- Queries to filter by evidence become complex
- Data type conversion errors when mixing approaches

**Recommended Fix:**
```sql
-- Use native PostgreSQL array type for better performance
ALTER TABLE audit_observations ALTER COLUMN "evidenceFilePaths" TYPE text[]
  USING string_to_array("evidenceFilePaths", ',');
```

---

### Issue #17: Status Columns with Inconsistent CHECK Constraints
**Severity:** MEDIUM
**Location:** Multiple tables
**Tables affected:**
- audit_observations (multiple CHECK constraints defined)
- branch_documents
- document_reupload_requests
- compliance_returns

**Problem:**
Status CHECK constraints use different enums and values:

**audit_observations** (20260205_audit_observations.sql, line 17):
```sql
CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CLOSED'))
```

**audit_observations** (20260206_governance_model_complete_schema.sql, line 276):
```sql
CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'))
```

**branch_documents** (20260210, lines 66):
```sql
CHECK (status IN ('UPLOADED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'))
```

**document_reupload_requests** (20260209, line 37):
```sql
status varchar(20) NOT NULL DEFAULT 'OPEN',  -- 'OPEN', 'SUBMITTED', 'REVERIFIED', 'REJECTED', 'CLOSED'
```

But constraint NOT created in migration!

**Impact:**
- Conflicting status values for same table (ACKNOWLEDGED vs IN_PROGRESS)
- document_reupload_requests allows invalid status values
- Application must track multiple valid status values
- Data consistency issues

**Recommended Fix:**
Standardize status values per entity type. Create a master status reference table or document allowed values per entity.

---

### Issue #18: Missing Foreign Key Constraints in Compliance Returns
**Severity:** MEDIUM
**Location:** `20260212_legitx_compliance_returns_audit_reports.sql` (lines 4-22)
**File:** `20260212_legitx_compliance_returns_audit_reports.sql`

**Problem:**
Already noted in Issue #8 but warrants MEDIUM classification:
- No FK constraint from filed_by_user_id to users table
- No parent table defined for tracking filing status

**Recommended Fix:**
```sql
ALTER TABLE compliance_returns
  ADD CONSTRAINT fk_comp_returns_filed_by
    FOREIGN KEY (filed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
```

---

### Issue #19: Index Naming Inconsistency
**Severity:** MEDIUM
**Location:** Multiple migrations
**Problem:**
Index naming convention varies across migrations:

- Some use `idx_` prefix: `idx_audit_obs_auditid`
- Some use `idx_` with full words: `idx_audit_observations_status`
- Some use specific naming: `uq_` for unique indexes
- Some use `ux_` for unique indexes

**Evidence:**
- Line 25 (20260205): `idx_audit_obs_auditid` (abbreviation)
- Line 289 (20260206): `idx_obs_audit_risk` (abbreviation)
- Line 97 (20260206): `ux_client_assignments_active` (uses ux_ instead of idx_)
- Line 51 (20260205_audit_observation_categories): `idx_audit_obs_cat_name` (abbreviation)

**Impact:**
- Difficult to find indexes through naming patterns
- DevOps scripts expecting naming conventions fail
- Index maintenance becomes error-prone

**Recommended Fix:**
Establish naming standard:
```
- Regular indexes: idx_[table]_[columns]
- Unique indexes: uq_[table]_[columns]
- Partial indexes: idx_[table]_[columns]_partial or [constraint name]

Example:
- idx_audit_observations_audit_id
- uq_client_assignments_client_type_active
```

---

### Issue #20: Missing Trigger for Updated_at in Multiple Tables
**Severity:** MEDIUM
**Location:** Multiple tables without triggers
**Tables affected:**
- notifications (no trigger defined)
- compliance_items (no trigger defined)
- branch_compliance_schedule (no trigger defined)
- audit_reports (has updated_at column but no trigger)

**Problem:**
Several tables define `updated_at` columns but don't have automatic update triggers:

```sql
-- branch_compliance_schedule (20260206, lines 210-221)
CREATE TABLE IF NOT EXISTS branch_compliance_schedule (
  ...
  updated_at TIMESTAMPTZ,
  -- NO TRIGGER DEFINED
);
```

Only some tables have triggers:
- audit_observations (trigger at line 41-44)
- branch_documents (trigger at line 71-84)
- contractor_required_documents (trigger at line 27-40)

**Impact:**
- updated_at will never be populated for tables without triggers
- Queries filtering by updated_at will be unreliable
- Data audit trail will be incomplete

**Recommended Fix:**
Add triggers to all tables with updated_at:
```sql
CREATE OR REPLACE FUNCTION update_[table]_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_[table]_updated_at
BEFORE UPDATE ON [table]
FOR EACH ROW
EXECUTE FUNCTION update_[table]_updated_at();
```

---

## 4. LOW SEVERITY ISSUES

### Issue #21: Index Redundancy - Partial Indexes Missing WHERE Clauses
**Severity:** LOW
**Location:** Multiple indexes
**Files:**
- `20260206_governance_model_complete_schema.sql` (line 259)
- `20260202_perf_and_scope_indexes.sql` (implied)

**Problem:**
Some indexes should be partial (filtered) for better performance but include all rows:

Example - audit overdue status:
```sql
-- Line 259 in 20260206
CREATE INDEX IF NOT EXISTS idx_audits_overdue ON audits(assigned_auditor_id, due_date)
  WHERE status IN ('ASSIGNED', 'IN_PROGRESS');
```

vs assignment due index:
```sql
-- Line 102 in 20260206
CREATE INDEX IF NOT EXISTS idx_client_assignments_due ON client_assignments(rotation_due_on)
  WHERE status = 'ACTIVE';
```

First is good (partial), second could be expanded to other indexes.

**Impact:**
- Index size larger than necessary
- Query performance suboptimal for common filter conditions
- Storage overhead

**Recommended Fix:**
Add WHERE clauses to commonly-filtered statuses:
```sql
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(to_user_id, created_at DESC)
  WHERE status = 'UNREAD';

CREATE INDEX IF NOT EXISTS idx_branch_documents_pending
  ON branch_documents(branch_id, status)
  WHERE status IN ('UPLOADED', 'UNDER_REVIEW');
```

---

### Issue #22: Enum Definition Strategy Inconsistency
**Severity:** LOW
**Location:** Multiple migrations
**Problem:**
Some columns use CHECK constraints for enums, others use explicit PostgreSQL ENUM types:

- audit_type: Initially enum, converted to varchar (20260207)
- frequency: Enum but values differ between DB and entity (20260207)
- assignment_type: CHECK constraint, not enum (20260206)
- status columns: All CHECK constraints (various tables)

**Impact:**
- No consistency in how enums are enforced
- Migration complexity when adding new enum values
- Code maintainability concerns

**Recommendation:**
Standardize approach:
```
Option A: Use PostgreSQL ENUM types for domain data
- Better validation at DB level
- Harder to modify post-deployment

Option B: Use CHECK constraints for all status/type fields
- More flexible for updates
- Consistent approach

Current: Hybrid approach with technical debt
```

---

### Issue #23: Unused/Orphaned Columns Left in Schema
**Severity:** LOW
**Location:** Various tables
**Problem:**
Reconciliation migrations explicitly leave unused columns for "data safety":

```sql
-- Line 113-114 in 20260207_entity_schema_reconciliation.sql
-- NOTE: Extra DB columns (branch_code, city, pincode) are kept for data safety.
-- To remove: ALTER TABLE client_branches DROP COLUMN IF EXISTS branch_code;
```

Similar pattern in:
- Line 192-197: compliance_tasks columns marked for removal
- Line 113-114: branch columns marked for removal

**Impact:**
- Schema bloat
- Confusion about which columns are active
- Documentation comments in SQL files instead of proper schema docs
- Migration future maintenance burden

**Recommendation:**
Either keep columns or remove them, but not both:
```sql
-- Option 1: Remove cleanly
ALTER TABLE client_branches DROP COLUMN IF EXISTS branch_code;
ALTER TABLE client_branches DROP COLUMN IF EXISTS city;
ALTER TABLE client_branches DROP COLUMN IF EXISTS pincode;

-- Option 2: Keep and document in migrations but mark as deprecated
COMMENT ON COLUMN client_branches.branch_code IS 'DEPRECATED - kept for data safety, remove after 2026-Q2';
```

---

## 5. DEPENDENCY ISSUES

### Detected Dependency Chain Problems

**Chain 1: Audit Tables**
```
20260206_governance_model_complete_schema.sql
  ↓ creates audits + audit_observations
20260205_audit_observations.sql (should run BEFORE)
  ↓ attempts to create same tables with different structure
20260207_fix_audit_type_enum.sql
  ↓ drops columns that governance added
20260207_entity_schema_reconciliation.sql
  ↓ drops same columns again, creates audit_observations with different columns
```

**Chain 2: Client Assignment Tables**
```
20260206_governance_model_complete_schema.sql
  ↓ creates client_assignments + client_assignment_history
20260207_entity_schema_reconciliation.sql
  ↓ drops and recreates with different structure
20260207_migrate_client_assignments.sql
  ↓ transforms data from old to new structure
```

**Chain 3: Branch References**
```
20260206_governance_model_complete_schema.sql
  ↓ creates branches table
20260207_entity_schema_reconciliation.sql
  ↓ conditionally renames to client_branches
20260211_add_branch_auditor_assignments.sql
  ↓ expects client_branches to exist, may fail if rename didn't execute
```

---

## 6. MIGRATION EXECUTION ORDER ISSUES

**Current file alphabetical order (how migrations are executed):**
1. 20260127_hrms_phase1_schema.sql ✓ (base schema)
2. 20260201_notification_reads.sql ✗ (references non-existent notification_threads)
3. 20260201_payroll_runs_and_payslips.sql
4. 20260202_perf_and_scope_indexes.sql
5. 20260203_payroll_templates_and_settings.sql
6. 20260205_* migrations ✗ (multiple audit conflicts)
7. 20260206_governance_model_complete_schema.sql (comprehensive but conflicts with prior)
8. 20260206_governance_model_complete_schema_rollback.sql (potentially applied?)
9. 20260207_* migrations ✗ (reconciliation conflicts with governance)
10. ... subsequent migrations depend on above chaos

**Root Cause:** Two competing schema design approaches applied sequentially:
1. Governance model (20260206) creates comprehensive new schema
2. Entity reconciliation (20260207) tries to fix it but drops/renames tables
3. Earlier migrations (20260205) assume different structure

---

## 7. SUMMARY TABLE: All Issues at a Glance

| # | Issue | File(s) | Type | Severity | Fix Time |
|---|-------|---------|------|----------|----------|
| 1 | Audit observations duplicate columns | 20260205*, 20260207* | Schema | CRITICAL | 2hr |
| 2 | Branch table renaming conflict | 20260206, 20260207 | FK | CRITICAL | 1hr |
| 3 | notification_reads invalid FK | 20260201 | FK | CRITICAL | 30min |
| 4 | Audits column add/drop conflict | 20260205, 20260207* | Schema | CRITICAL | 3hr |
| 5 | audit_type enum conversion race | 20260207 | Type | CRITICAL | 1hr |
| 6 | UUID function incompatibility | 20260212 | Syntax | CRITICAL | 15min |
| 7 | branch_auditor_assignments FK dangling | 20260211 | FK | CRITICAL | 30min |
| 8 | compliance_returns missing FK | 20260212 | FK | CRITICAL | 30min |
| 9 | audit_reports duplicate definition | 20260206, 20260212 | Schema | HIGH | 2hr |
| 10 | Client assignment history mismatch | 20260206, 20260207* | Schema | HIGH | 2hr |
| 11 | Branch auditor assignment naming | 20260211 | Naming | HIGH | 30min |
| 12 | Document workflow ID type mismatch | 20260209 | Type | HIGH | 1hr |
| 13 | Compliance evidence ID type mismatch | 20260207 | Type | HIGH | 1hr |
| 14 | View references non-existent column | 20260206 | View | HIGH | 1hr |
| 15 | Contractor required docs NULL uniqueness | 20260210 | Constraint | HIGH | 30min |
| 16 | Evidence file paths type inconsistent | 20260205, 20260207* | Type | MEDIUM | 30min |
| 17 | Status CHECK constraints inconsistent | Various | Constraint | MEDIUM | 1hr |
| 18 | Missing FK constraints | 20260212 | FK | MEDIUM | 30min |
| 19 | Index naming inconsistency | All migrations | Design | MEDIUM | 1hr |
| 20 | Missing updated_at triggers | Various | Trigger | MEDIUM | 1hr |
| 21 | Index partial filter missing | 20260206, 20260202 | Index | LOW | 30min |
| 22 | Enum strategy inconsistency | Various | Design | LOW | 1hr |
| 23 | Orphaned columns in schema | 20260207 | Cleanup | LOW | 30min |

**Total Estimated Fix Time: 25-30 hours**

---

## 8. RECOMMENDED REMEDIATION STRATEGY

### Phase 1: Immediate (CRITICAL) - 12 hours
1. **Backup database** - Create full backup before any changes
2. **Fix UUID functions** (Issue #6) - 15 minutes
   - Change all `uuid_generate_v4()` to `gen_random_uuid()`
3. **Consolidate audit_observations** (Issue #1) - 2 hours
   - Drop and recreate with canonical schema
4. **Fix notification_reads FK** (Issue #3) - 30 minutes
   - Update to reference `notifications` not `notification_threads`
5. **Standardize branch table name** (Issue #2, #7) - 1 hour
   - Decide on `branches` vs `client_branches`, update all FKs
6. **Reconcile audit table columns** (Issue #4) - 3 hours
   - Decide final columns, update all dependent objects
7. **Add missing FK constraints** (Issues #8, #13, #18) - 2 hours
   - compliance_returns, audit_reports, compliance_evidence

### Phase 2: High Priority (HIGH) - 10 hours
8. **Merge audit_reports definitions** (Issue #9) - 2 hours
9. **Standardize assignment history** (Issue #10) - 2 hours
10. **Fix document workflow types** (Issue #12) - 1 hour
11. **Rename auditor_user_id → assigned_user_id** (Issue #11) - 30 minutes
12. **Update escalation view** (Issue #14) - 1 hour
13. **Fix contractor required docs constraint** (Issue #15) - 30 minutes

### Phase 3: Medium Priority (MEDIUM) - 5 hours
14. **Standardize status CHECK constraints** (Issue #17) - 1 hour
15. **Fix data type inconsistencies** (Issue #16) - 30 minutes
16. **Add missing triggers** (Issue #20) - 1 hour
17. **Standardize index naming** (Issue #19) - 1 hour
18. **Add partial index WHERE clauses** (Issue #21) - 30 minutes

### Phase 4: Low Priority (LOW) - 2 hours
19. **Standardize enum strategy** (Issue #22) - 1 hour
20. **Remove orphaned columns** (Issue #23) - 30 minutes
21. **Documentation & testing** - 30 minutes

---

## 9. TESTING CHECKLIST

After applying fixes, verify:

- [ ] All migrations execute without errors
- [ ] No orphaned foreign key constraints
- [ ] No unreferenced columns
- [ ] TypeORM entities match database schema
- [ ] All views execute successfully
- [ ] No duplicate table definitions
- [ ] Consistent naming conventions
- [ ] All audit trails functional (created_at, updated_at triggers)
- [ ] Backup/restore procedures work
- [ ] Query performance acceptable on large datasets
- [ ] Application startup without schema errors

---

## 10. PREVENTION MEASURES

For future migrations:

1. **Single source of truth** - One baseline schema definition
2. **No overlapping migrations** - Sequential refinement only
3. **Mandatory peer review** - Schema changes must be reviewed
4. **Automated validation** - Run migration linter on all SQL
5. **Version control** - Track migration dependencies explicitly
6. **Testing suite** - Automated schema validation tests
7. **Documentation** - Maintain comprehensive ER diagram

---

**Report Generated:** 2026-02-12
**Total Issues:** 23
**Estimated Fix Time:** 30-35 hours
**Priority:** Address CRITICAL issues before production deployment
