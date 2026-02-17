# SQL Schema Migration - Remediation Implementation Guide

**Date:** 2026-02-12
**Status:** ✅ All fixes generated and ready for deployment
**Total Issues Fixed:** 15 (8 Critical + 7 High Priority)

---

## Overview

Two comprehensive migration files have been created to fix all identified schema issues:

1. **20260212_CRITICAL_FIXES.sql** - Fixes 8 critical issues (must run first)
2. **20260212_HIGH_PRIORITY_FIXES.sql** - Fixes 7 high-priority issues (run after critical)

Both files are located in: `backend/migrations/`

---

## Pre-Deployment Checklist

### Step 1: Backup Database
```bash
# Create a backup before running migrations
pg_dump statco_db -U dbuser -h localhost > statco_db_backup_$(date +%Y%m%d_%H%M%S).sql
```

### Step 2: Verify Current State
```bash
# Check which migrations have been applied
psql -U dbuser -h localhost -d statco_db -c "SELECT * FROM schema_migrations ORDER BY version;"

# Count current tables
psql -U dbuser -h localhost -d statco_db -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"

# Check for FK constraint errors
psql -U dbuser -h localhost -d statco_db -c "SELECT constraint_name, table_name FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY';"
```

### Step 3: Verify Data Existence
```bash
# Check if any production data exists
psql -U dbuser -h localhost -d statco_db -c "
  SELECT table_name,
         (SELECT COUNT(*) FROM information_schema.schemata) as row_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name;
"
```

---

## Deployment Steps

### Phase 1: Run Critical Fixes (Downtime: 5-10 minutes)

```bash
# Method 1: Using psql
psql -U dbuser -h localhost -d statco_db -f backend/migrations/20260212_CRITICAL_FIXES.sql

# Method 2: Using TypeORM migrations (if configured)
npm run typeorm migration:run
```

**What it fixes:**
- ✅ Notification reads FK reference (notification_threads → notifications)
- ✅ Branch table naming (client_branches → branches)
- ✅ Audit observations table consolidation
- ✅ Audits table column conflicts
- ✅ UUID function compatibility
- ✅ Audit type enum conversion
- ✅ Branch auditor assignments FK
- ✅ Compliance returns FK constraints

**Expected output:**
```
BEGIN
...
COMMIT
```

### Phase 2: Run High-Priority Fixes (Downtime: 10-15 minutes)

```bash
# Wait 5 minutes for Phase 1 to stabilize, then:
psql -U dbuser -h localhost -d statco_db -f backend/migrations/20260212_HIGH_PRIORITY_FIXES.sql
```

**What it fixes:**
- ✅ Audit reports duplicate table definitions
- ✅ Client assignment history column incompatibilities
- ✅ Auditor naming standardization
- ✅ Document workflow ID type mismatches
- ✅ Compliance evidence ID type mismatches
- ✅ Invalid views cleanup
- ✅ Unique constraint NULL handling

**Expected output:**
```
BEGIN
...
COMMIT
```

### Phase 3: Post-Deployment Verification

```bash
# 1. Check for errors in logs
grep -i error /var/log/postgresql/postgresql.log | tail -20

# 2. Verify key tables exist
psql -U dbuser -h localhost -d statco_db -c "
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name IN (
    'audit_observations', 'branches', 'notification_reads',
    'audits', 'audit_reports', 'compliance_returns'
  )
  ORDER BY table_name;
"

# 3. Check FK constraints are valid
psql -U dbuser -h localhost -d statco_db -c "
  SELECT constraint_name, table_name, referenced_table_name
  FROM information_schema.referential_constraints
  WHERE constraint_schema = 'public'
  LIMIT 20;
"

# 4. Test application connection
npm test -- --testNamePattern="database connection"
```

---

## Detailed Fix Descriptions

### CRITICAL FIXES (20260212_CRITICAL_FIXES.sql)

#### Fix #1: Notification Reads FK Reference
**Before:**
```sql
ALTER TABLE notification_reads
ADD CONSTRAINT fk_notification_reads_notification
FOREIGN KEY (notification_id) REFERENCES notification_threads(id) ON DELETE CASCADE
-- ERROR: Table notification_threads doesn't exist!
```

**After:**
```sql
ALTER TABLE notification_reads
ADD CONSTRAINT fk_notification_reads_notification
FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE
-- ✅ References correct table
```

**Impact:** Notifications system will now work correctly

---

#### Fix #2: Branch Table Naming
**Before:**
- Migration 20260206 creates: `branches` table
- Migration 20260207 renames to: `client_branches`
- Newer tables FK to: `client_branches`
- **Result:** Inconsistent references, potential FK errors

**After:**
- Standardize to: `branches`
- All FKs updated to: `branches`
- Consistent naming across all tables

**Impact:** No more FK constraint errors for branch references

---

#### Fix #3: Audit Observations Consolidation
**Before:**
- Multiple migrations create same table with different columns:
  - snake_case vs camelCase
  - Different column definitions
  - Different constraints
- **Result:** TypeORM entity mapping fails

**After:**
- Single canonical definition with all columns
- Proper FK constraints
- Correct indexes and triggers

**Impact:** Audit observations functionality restored

---

#### Fix #4-8: Other Critical Fixes
Similar patterns for:
- Audits table column conflicts
- UUID function standardization
- Enum conversion safety
- Compliance returns FK constraints

---

### HIGH PRIORITY FIXES (20260212_HIGH_PRIORITY_FIXES.sql)

#### Fix H1: Audit Reports Table
**Resolution:** Drop duplicates, create single canonical table with:
- UUID PK
- Proper FK to audits
- Status workflow columns
- Approval tracking

---

#### Fix H2: Client Assignment History
**Resolution:** Standardize columns:
- UUID IDs (not BIGINT)
- Consistent nullable fields
- Proper FK constraints
- Date range columns

---

#### Fix H3: Auditor Naming
**Resolution:** Standardize to:
- `assigned_auditor_id` in audits
- `recorded_by_user_id` in observations
- Removes: `auditor_user_id`, `assigned_user_id`

---

#### Fix H4-H7: Other High Priority Fixes
- Document workflow table ID standardization (UUID)
- Compliance evidence type consistency
- View validation cleanup
- Unique constraint NULL handling

---

## Rollback Plan

If issues occur after deployment:

### Rollback from Backup
```bash
# Stop application
systemctl stop statco-backend

# Restore from backup
psql -U dbuser -h localhost -d statco_db < statco_db_backup_20260212_HHMMSS.sql

# Restart application
systemctl start statco-backend

# Verify
npm test
```

### Partial Rollback (if only Phase 2 fails)
```bash
# Don't restore full backup, just drop the problematic tables from Phase 2
# and re-run Phase 2 migration
psql -U dbuser -h localhost -d statco_db -f backend/migrations/20260212_HIGH_PRIORITY_FIXES.sql
```

---

## Testing Strategy

### Unit Tests
```bash
# Test database connection
npm test -- --testNamePattern="database"

# Test entity migrations
npm test -- --testNamePattern="typeorm"
```

### Integration Tests
```bash
# Test all affected modules
npm test -- --testNamePattern="audit|compliance|notification|assignment"

# Run full test suite
npm test
```

### Manual Verification
```bash
# Test each critical workflow
npm run dev

# In separate terminal:
curl http://localhost:3000/health
curl http://localhost:3000/api/audits
curl http://localhost:3000/api/notifications
curl http://localhost:3000/api/assignments
```

---

## Application Code Updates

After migrations are successful, update application code:

### 1. TypeORM Entity Mappings
Verify all `@Column()` decorators match database column names:
- `audit_observations`: Use correct casing
- `branches`: Remove `client_branches` references
- `audits`: Use `assigned_auditor_id` (not `auditor_user_id`)

### 2. Entity Relations
Update `@ManyToOne()` and `@OneToMany()` references:
- All branch references point to `branches` table
- Audit relationships use correct FK names

### 3. Service Layer Queries
Update raw queries to use fixed column names:
```typescript
// Before
SELECT * FROM audits WHERE auditor_user_id = $1;

// After
SELECT * FROM audits WHERE assigned_auditor_id = $1;
```

### 4. API Response Mappings
Update DTO and response transformers:
```typescript
// Ensure audit observations DTO matches schema
interface AuditObservationDto {
  sequenceNumber?: number;  // camelCase
  observation: string;
  recordedByUserId: string;  // Not auditorUserId
}
```

---

## Monitoring After Deployment

### Log Monitoring
```bash
# Watch for FK errors
tail -f /var/log/postgresql/postgresql.log | grep -i "foreign key"

# Watch for type errors
tail -f /var/log/postgresql/postgresql.log | grep -i "type"
```

### Database Monitoring
```bash
# Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

# Check slow queries
SELECT query, mean_time FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat%'
ORDER BY mean_time DESC
LIMIT 10;
```

### Application Monitoring
```bash
# Check error rates in application logs
grep -i "error" logs/app.log | wc -l

# Check FK constraint violation errors
grep -i "foreign key" logs/app.log | wc -l
```

---

## Timeline Estimate

| Phase | Task | Duration | Downtime |
|-------|------|----------|----------|
| Pre | Backup + Verification | 10-15 min | None |
| 1 | Critical Fixes | 5-10 min | 5-10 min |
| 2 | High Priority Fixes | 10-15 min | 10-15 min |
| 3 | Testing & Verification | 15-30 min | None |
| 4 | Code Updates (if needed) | 30-60 min | None |
| **Total** | | **70-130 min** | **15-25 min** |

---

## FAQ

### Q: Can I run both migrations at once?
**A:** No. Run Critical first, verify, then High Priority. They have dependencies.

### Q: What if the database is in production with active data?
**A:** All migrations use `IF EXISTS` and `IF NOT EXISTS` checks to prevent data loss. However, test in staging first.

### Q: Can I skip the High Priority fixes?
**A:** Not recommended. They fix 7 additional issues. Run both for complete fix.

### Q: How do I know if a fix worked?
**A:** Check the verification steps in Phase 3. Test your application endpoints.

### Q: What if I see constraint errors?
**A:** This means some table references were still using old names. Apply the fixes again or manually update remaining references.

---

## Success Criteria

After completing all remediations:

- ✅ All tables exist and are accessible
- ✅ No FK constraint violations
- ✅ All indexes created successfully
- ✅ Views are valid and queryable
- ✅ TypeORM entities map correctly
- ✅ Application tests pass
- ✅ API endpoints respond without errors
- ✅ No warnings in database logs

---

## Support

If you encounter issues:

1. Check `SCHEMA_ANALYSIS_REPORT.md` for detailed issue descriptions
2. Review the specific migration file for that issue
3. Check PostgreSQL logs: `/var/log/postgresql/postgresql.log`
4. Run verification queries from Phase 3
5. Test with `npm test` to identify specific failures

---

**Generated:** 2026-02-12
**Next Steps:** Follow the deployment steps above
