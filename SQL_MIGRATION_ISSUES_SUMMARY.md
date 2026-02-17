# SQL Migration Issues - Executive Summary

**Date:** 2026-02-12
**Total Issues Found:** 23
**Critical Issues:** 8
**Estimated Fix Time:** 30-35 hours

---

## Quick Overview

Your migration folder has **23 identified issues** stemming from two competing schema design approaches applied sequentially without proper reconciliation:

1. **Governance Model** (20260206) - Comprehensive new schema
2. **Entity Reconciliation** (20260207) - Attempted fixes but created conflicts
3. **Earlier migrations** (20260205 and earlier) - Assumed different structure

---

## 8 CRITICAL Issues (Must Fix Before Production)

### 🔴 Issue #1: Audit Observations Table Chaos
**Files:** `20260205_audit_observations.sql`, `20260207_fix_audit_type_enum.sql`, `20260207_entity_schema_reconciliation.sql`
**Problem:** Three migrations define same table with conflicting column names (snake_case vs camelCase)
**Impact:** TypeORM entity mapping will fail, database queries use wrong columns
**Fix:** Drop and recreate table with single canonical definition

---

### 🔴 Issue #2: Branch Table Naming Conflict
**Files:** `20260206_governance_model_complete_schema.sql`, `20260207_entity_schema_reconciliation.sql`
**Problem:** Governance creates `branches`, reconciliation renames to `client_branches` conditionally
**Impact:** If rename fails silently, newer tables have dangling ForeignKey references
**Fix:** Choose one name and update all references consistently

---

### 🔴 Issue #3: Notification Reads Invalid Foreign Key
**File:** `20260201_notification_reads.sql`
**Problem:** Creates FK to non-existent `notification_threads` table (should be `notifications`)
**Impact:** Migration will error out on execution
**Fix:** Update FK constraint to reference correct table

---

### 🔴 Issue #4: Audit Table - Conflicting Column Operations
**Files:** `20260205_fix_audits_schema.sql`, `20260207_fix_audit_type_enum.sql`
**Problem:** Migrations add `branch_id`, `start_date`, `end_date` then drop them
**Impact:** Data loss if records existed; schema inconsistency
**Fix:** Determine if columns needed and either keep or remove consistently

---

### 🔴 Issue #5: UUID Function Incompatibility
**File:** `20260212_legitx_compliance_returns_audit_reports.sql`
**Problem:** Uses `uuid_generate_v4()` but others use `gen_random_uuid()`
**Impact:** Migration fails if uuid-ossp extension not installed
**Fix:** Use consistent `gen_random_uuid()` function

---

### 🔴 Issue #6: Audit Type Enum Conversion Race Condition
**File:** `20260207_fix_audit_type_enum.sql`
**Problem:** Conditional enum-to-varchar conversion may silently fail on re-runs
**Impact:** Inconsistent data types across schema versions
**Fix:** Use explicit DROP TYPE IF EXISTS and proper migration guards

---

### 🔴 Issue #7: Branch Auditor Assignments FK Dangling
**File:** `20260211_add_branch_auditor_assignments.sql`
**Problem:** References `client_branches` which may not exist due to Issue #2
**Impact:** Cannot insert records if branch table not properly named
**Fix:** Resolve Issue #2 first, then ensure consistent references

---

### 🔴 Issue #8: Compliance Returns Missing Constraints
**File:** `20260212_legitx_compliance_returns_audit_reports.sql`
**Problem:** No FK constraints on `client_id` and `branch_id` columns
**Impact:** Orphaned records possible, data integrity issues
**Fix:** Add FK constraints for referential integrity

---

## 7 HIGH Severity Issues

| # | Issue | File | Impact |
|---|-------|------|--------|
| H1 | Audit Reports table defined twice with different schemas | `20260207_entity_schema_reconciliation.sql` | Data loss during migration |
| H2 | Client assignment history - incompatible columns | `20260207_migrate_client_assignments.sql` | Query failures |
| H3 | Auditor naming conflict (auditor_user_id vs assigned_user_id) | Multiple files | Code/query inconsistencies |
| H4 | Document workflow tables using BIGINT vs UUID | `20260210_branch_documents_and_establishment.sql` | Type mismatches in joins |
| H5 | Compliance evidence ID type mismatch | `20260209_add_evidence_columns.sql` | FK constraint failures |
| H6 | Views referencing non-existent columns | `SCHEMA_README.md` references | Query errors |
| H7 | Unique constraints allowing duplicates with NULL | `20260206_governance_model_complete_schema.sql` | Data validation failure |

---

## 5 MEDIUM Severity Issues

- Evidence file paths type inconsistency (TEXT vs TEXT[])
- Status columns with conflicting CHECK constraints
- Missing foreign key constraints in multiple tables
- Index naming convention inconsistency
- Missing `updated_at` triggers

---

## 3 LOW Severity Issues

- Index redundancy (missing WHERE clauses)
- Enum definition strategy inconsistency
- Orphaned columns left in schema

---

## Affected Tables

The following tables have issues and need attention:

| Table | Issue | Severity |
|-------|-------|----------|
| `audit_observations` | Multiple definitions with conflicting columns | CRITICAL |
| `branches` / `client_branches` | Naming conflict across migrations | CRITICAL |
| `notification_reads` | Invalid FK reference | CRITICAL |
| `audits` | Conflicting column operations (add/drop) | CRITICAL |
| `audit_reports` | Defined twice with different schemas | HIGH |
| `client_assignments` | Incompatible column structure | HIGH |
| `branch_auditor_assignments` | FK to potentially non-existent table | CRITICAL |
| `compliance_returns` | Missing FK constraints | CRITICAL |
| `compliance_evidence` | ID type mismatch | HIGH |
| `branch_documents` | BIGINT vs UUID type mismatch | HIGH |

---

## Migration Execution Problems

### Dependency Issues
- `20260201_notification_reads.sql` depends on `notification_threads` (doesn't exist)
- `20260211_add_branch_auditor_assignments.sql` depends on `client_branches` (naming uncertain)
- `20260212_legitx_compliance_returns_audit_reports.sql` depends on UUID extension

### Re-execution Idempotency
- Cannot safely re-run `20260207_fix_audit_type_enum.sql` (enum conversion may fail)
- `20260207_entity_schema_reconciliation.sql` has conditional table rename that may not trigger

---

## Remediation Strategy (4 Phases)

### Phase 1: Investigation (2-3 hours)
- [ ] Determine current database state
- [ ] Check which migrations have successfully executed
- [ ] Identify which tables actually exist in the database
- [ ] Document current column names and types

### Phase 2: Critical Fixes (8-10 hours)
- [ ] Fix notification FK (Issue #3)
- [ ] Standardize branch table naming (Issue #2)
- [ ] Consolidate audit_observations table (Issue #1)
- [ ] Add missing FK constraints (Issue #8)

### Phase 3: High Priority Fixes (10-12 hours)
- [ ] Reconcile audit reports table definitions
- [ ] Fix client assignment history columns
- [ ] Resolve auditor naming conflicts
- [ ] Fix document workflow ID types

### Phase 4: Medium/Low Fixes (8-10 hours)
- [ ] Add missing updated_at triggers
- [ ] Fix unique constraints with NULLs
- [ ] Consolidate evidence file path types
- [ ] Standardize index naming

---

## Detailed Report

For comprehensive analysis including:
- SQL code examples for each issue
- Recommended fixes with corrected SQL
- Root cause analysis for each migration
- Dependency chain diagrams
- Testing checklist
- Prevention measures for future migrations

**See:** `SCHEMA_ANALYSIS_REPORT.md` (41 KB, comprehensive)

---

## Immediate Actions Required

### Before ANY deployments:
1. ✅ Read full `SCHEMA_ANALYSIS_REPORT.md`
2. ✅ Identify current database state
3. ✅ Prioritize issues by business impact
4. ✅ Create backup of production database
5. ✅ Plan migration strategy

### Don't deploy with:
- ❌ Unresolved Issue #1 (audit_observations)
- ❌ Unresolved Issue #2 (branch naming)
- ❌ Unresolved Issue #3 (notification FK)
- ❌ Unresolved Issue #8 (compliance FK)

---

## Questions to Ask

1. **What is the current database state?** Are all migrations applied? Which schema version is active?
2. **Are there any existing records?** If so, data migration strategy is critical before fixing schema.
3. **Which tables are actively used?** Prioritize fixes for production tables over optional ones.
4. **What's the deployment timeline?** This affects whether we fix incrementally or do full schema reset.

---

**Generated:** 2026-02-12
**Full Report:** `SCHEMA_ANALYSIS_REPORT.md`
