# Governance Model Database Schema

## Overview
Complete PostgreSQL database schema supporting the Statco governance model with role-based dashboards, drill-down navigation, smart routing, assignment rotation, and audit workflows.

## Schema Version
- **Created**: 2026-02-06
- **PostgreSQL**: 14+
- **Migration File**: `20260206_governance_model_complete_schema.sql`
- **Rollback File**: `20260206_governance_model_complete_schema_rollback.sql`
- **Dashboard Queries**: `DASHBOARD_QUERIES.sql` - Production-ready SQL for all dashboard endpoints
- **API Catalog**: `DASHBOARD_API_CATALOG.md` - Quick reference for backend implementation with NestJS examples

---

## Core Design Principles

### 1. **No Duplicate Assignments**
```sql
-- Enforced via unique partial index
CREATE UNIQUE INDEX ux_client_assignments_active
ON client_assignments (client_id, assignment_type)
WHERE status = 'ACTIVE';
```
- ✅ One client → **one active CRM** at a time
- ✅ One client → **one active Auditor** at a time
- ❌ Prevents overlapping assignments

### 2. **Automatic Rotation Tracking**
```sql
-- CRM: 12 months rotation
-- Auditor: 4 months rotation
SELECT calculate_rotation_due_date('CRM', '2026-01-15');
-- Returns: 2027-01-15

SELECT calculate_rotation_due_date('AUDITOR', '2026-01-15');
-- Returns: 2026-05-15
```

### 3. **Smart Notification Routing**
Query type automatically routes to appropriate role:
- `TECHNICAL` → Admin
- `COMPLIANCE` → Assigned CRM
- `AUDIT` → Assigned Auditor
- `SYSTEM` → Admin

### 4. **Governance Separation**
- **Admin**: Control tower (counts, SLA, escalations)
- **CRM**: Compliance execution (schedule, documents, queries)
- **Auditor**: Audit execution (observations, evidence, reports)

---

## Table Structure

### Core Tables (5)
| Table | Purpose | Key Constraints |
|-------|---------|-----------------|
| `clients` | Master client list | State filtering, active flag |
| `branches` | Branch/plant locations | Client cascade delete |
| `users` | Role-based users | Email unique, role filtering |
| `client_assignments` | Current assignments | **No duplicates** (unique partial index) |
| `client_assignment_history` | Audit trail | Full rotation history |

### Compliance System (2)
| Table | Purpose | Indexes |
|-------|---------|---------|
| `compliance_items` | Master obligations | Category, frequency |
| `branch_compliance_schedule` | Per-branch tracking | Branch+due_date, status+due_date |

### Audit System (3)
| Table | Purpose | Indexes |
|-------|---------|---------|
| `audits` | Audit assignments | Auditor+due_date, status+due_date |
| `audit_observations` | Findings | Risk+status, high-risk open |
| `audit_reports` | Final reports | Audit, status |

### Evidence & Files (2)
| Table | Purpose | Pattern |
|-------|---------|---------|
| `files` | File metadata | Central storage |
| `evidence_links` | Polymorphic links | Links files to any entity |

### Notifications (1)
| Table | Purpose | Key Features |
|-------|---------|--------------|
| `notifications` | Universal inbox/outbox | Smart routing, priority levels |

---

## Key Views

### 1. Admin Escalations Queue
```sql
SELECT * FROM admin_escalations_view
WHERE days_delayed > 7
ORDER BY days_delayed DESC;
```

**Sources**:
- Overdue audits
- Overdue rotations
- High-risk open observations

**Columns**:
- `issue_type`: AUDIT | ASSIGNMENT | OBSERVATION
- `reason`: OVERDUE | ROTATION_OVERDUE | HIGH_RISK_OPEN
- `days_delayed`: Calculated from due date or age
- `owner_role`, `owner_user_id`, `owner_name`

### 2. System Health Metrics
```sql
SELECT * FROM admin_system_health_view;
```

**Metrics**:
- `inactive_users_15d`: Users not logged in for 15+ days
- `unassigned_clients`: Active clients without CRM/Auditor
- `failed_notifications_7d`: Unread admin notifications (7 days)
- `failed_jobs_24h`: Background job failures (placeholder)

---

## Usage Examples

### 1. Assign CRM to Client
```sql
-- Insert new assignment (rotation_due_on calculated automatically)
INSERT INTO client_assignments (client_id, assignment_type, assigned_user_id, assigned_on)
VALUES (
  'c123-uuid',
  'CRM',
  'user456-uuid',
  '2026-02-06'
);
-- rotation_due_on will be: 2027-02-06 (12 months)

-- Record in history
INSERT INTO client_assignment_history (
  client_id, assignment_type, old_user_id, new_user_id, 
  effective_date, reason, changed_by_user_id
)
VALUES (
  'c123-uuid', 'CRM', NULL, 'user456-uuid',
  '2026-02-06', 'Initial assignment', 'admin-uuid'
);
```

### 2. Rotate Auditor
```sql
-- Deactivate old assignment
UPDATE client_assignments
SET status = 'INACTIVE', updated_at = now()
WHERE client_id = 'c123-uuid' AND assignment_type = 'AUDITOR' AND status = 'ACTIVE';

-- Create new assignment
INSERT INTO client_assignments (client_id, assignment_type, assigned_user_id, assigned_on)
VALUES ('c123-uuid', 'AUDITOR', 'new-auditor-uuid', CURRENT_DATE);

-- Log rotation
INSERT INTO client_assignment_history (
  client_id, assignment_type, old_user_id, new_user_id, 
  effective_date, reason, changed_by_user_id
)
VALUES (
  'c123-uuid', 'AUDITOR', 'old-auditor-uuid', 'new-auditor-uuid',
  CURRENT_DATE, 'Scheduled 4-month rotation', 'admin-uuid'
);
```

### 3. Create Notification with Smart Routing
```sql
-- Compliance query automatically routes to assigned CRM
WITH assigned_crm AS (
  SELECT assigned_user_id, 'CRM' AS role
  FROM client_assignments
  WHERE client_id = 'c123-uuid' AND assignment_type = 'CRM' AND status = 'ACTIVE'
  LIMIT 1
)
INSERT INTO notifications (
  from_user_id, from_role, to_user_id, to_role,
  client_id, query_type, subject, message, context_type
)
SELECT
  'legitx-user-uuid', 'LEGITX', ac.assigned_user_id, ac.role,
  'c123-uuid', 'COMPLIANCE', 'Form 8 frequency', 
  'Please confirm submission frequency for Form 8', 'COMPLIANCE'
FROM assigned_crm ac;
```

### 4. Track Audit with Observations
```sql
-- Create audit
INSERT INTO audits (
  client_id, branch_id, audit_type, audit_name, 
  assigned_auditor_id, due_date, status
)
VALUES (
  'c123-uuid', 'b456-uuid', 'STATUTORY',
  'Factories Act Compliance Audit Q1-2026',
  'auditor-uuid', '2026-02-28', 'ASSIGNED'
);

-- Add high-risk observation
INSERT INTO audit_observations (
  audit_id, title, description, risk, law_reference, 
  recommendation, owner_role, created_by
)
VALUES (
  'audit-uuid', 'Pressure vessel in open area',
  'Pressure vessel found without protective shed',
  'HIGH', 'Factories Act Sec 31 & Telangana Rules Rule 56',
  'Provide shed, anti-corrosive paint, re-test by competent person',
  'CRM', 'auditor-uuid'
);

-- Attach evidence
INSERT INTO evidence_links (file_id, entity_type, entity_id)
VALUES ('file-uuid', 'OBSERVATION', 'observation-uuid');
```

### 5. Query Overdue Compliances (CRM Dashboard)
```sql
-- Get overdue compliance items for CRM's assigned branches
SELECT 
  c.name AS client_name,
  b.name AS branch_name,
  ci.category,
  ci.title AS compliance_item,
  bcs.due_date,
  (CURRENT_DATE - bcs.due_date) AS days_overdue,
  ci.risk
FROM branch_compliance_schedule bcs
JOIN branches b ON bcs.branch_id = b.id
JOIN clients c ON b.client_id = c.id
JOIN compliance_items ci ON bcs.compliance_item_id = ci.id
WHERE b.client_id IN (
  SELECT client_id 
  FROM client_assignments 
  WHERE assigned_user_id = 'crm-user-uuid' 
    AND assignment_type = 'CRM' 
    AND status = 'ACTIVE'
)
  AND bcs.status = 'PENDING'
  AND bcs.due_date < CURRENT_DATE
ORDER BY bcs.due_date ASC;
```

### 6. Get Auditor's Active Audits
```sql
-- Auditor dashboard - my audits
SELECT 
  a.id,
  c.name AS client_name,
  b.name AS branch_name,
  a.audit_name,
  a.due_date,
  a.status,
  a.progress_pct,
  (SELECT COUNT(*) FROM audit_observations WHERE audit_id = a.id AND status IN ('OPEN', 'IN_PROGRESS')) AS open_observations
FROM audits a
JOIN clients c ON a.client_id = c.id
LEFT JOIN branches b ON a.branch_id = b.id
WHERE a.assigned_auditor_id = 'auditor-user-uuid'
  AND a.status IN ('ASSIGNED', 'IN_PROGRESS')
ORDER BY a.due_date ASC;
```

---

## Performance Optimization

### Critical Indexes Created
```sql
-- Prevent duplicate assignments (enforces business rule)
ux_client_assignments_active

-- Dashboard performance
idx_audits_status_due           -- Auditor dashboard (overdue/due soon)
idx_schedule_status_due         -- CRM dashboard (compliance tracking)
idx_notifications_to_user       -- All inbox queries
idx_obs_high_risk_open         -- Admin escalations (high-risk observations)

-- Assignment lookups
idx_client_assignments_user     -- Find user's assigned clients
idx_client_assignments_due      -- Rotation due tracking

-- Audit trail
idx_assignment_history_client   -- Client assignment history
```

### Query Performance Notes
- **Admin Dashboard**: Uses `admin_escalations_view` materialized or cached
- **CRM Dashboard**: Direct queries filtered by `assigned_user_id`
- **Auditor Dashboard**: Direct queries on `audits` table with user filter
- **Notifications**: Compound index on `(to_user_id, status)` for fast inbox

---

## Migration Instructions

### Apply Schema
```bash
# PostgreSQL command line
psql -U statco_user -d statco_db -f migrations/20260206_governance_model_complete_schema.sql

# Or via TypeORM/NestJS migration
npm run migration:run
```

### Rollback Schema
```bash
psql -U statco_user -d statco_db -f migrations/20260206_governance_model_complete_schema_rollback.sql
```

### Verify Installation
```sql
-- Check tables created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check critical constraint
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE indexname = 'ux_client_assignments_active';

-- Check views
SELECT table_name 
FROM information_schema.views 
WHERE table_schema = 'public';

-- Check functions
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public';
```

---

## Business Rules Enforced

### Assignment Rules
1. ✅ **One client = one active CRM** (enforced by unique index)
2. ✅ **One client = one active Auditor** (enforced by unique index)
3. ✅ **CRM rotation every 12 months** (auto-calculated)
4. ✅ **Auditor rotation every 4 months** (auto-calculated)
5. ✅ **Full audit trail** (all changes logged in history table)

### Notification Rules
1. ✅ **TECHNICAL queries** → Admin
2. ✅ **COMPLIANCE queries** → Assigned CRM
3. ✅ **AUDIT queries** → Assigned Auditor
4. ✅ **Status tracking** (UNREAD → READ → CLOSED)
5. ✅ **Priority levels** (LOW, NORMAL, HIGH, CRITICAL)

### Data Integrity
1. ✅ **Cascade deletes** on client/branch removal
2. ✅ **Foreign key constraints** prevent orphaned records
3. ✅ **Check constraints** enforce valid enum values
4. ✅ **NOT NULL constraints** on critical fields
5. ✅ **Timestamptz** for timezone-aware dates

---

## Next Steps

### Backend Implementation
1. Create TypeORM entities mapping to these tables
2. Implement repository services for CRUD operations
3. Add business logic for assignment rotation
4. Build notification routing service
5. Create dashboard API endpoints

### Data Population
1. Seed master `compliance_items` table
2. Import existing clients and branches
3. Create initial user accounts with roles
4. Generate compliance schedules for branches
5. Set up initial CRM/Auditor assignments

### Testing
1. Test duplicate assignment prevention
2. Verify rotation due date calculation
3. Test notification routing logic
4. Load test dashboard queries
5. Verify cascade deletes work correctly

---

## Dashboard Queries Reference

Production-ready SQL queries for all dashboard endpoints are documented in separate files for easier maintenance and implementation:

### 📄 DASHBOARD_QUERIES.sql
Complete SQL queries with:
- **Admin Dashboard**: 4 endpoints (summary, escalations, assignments-attention, system-health)
- **CRM Dashboard**: 5 endpoints (summary, due-compliances, low-coverage-branches, pending-documents, queries)
- **Auditor Dashboard**: 5 endpoints (summary, audits, observations, evidence-pending, reports)
- Full parameter documentation
- CTE-based scoping for role-based access
- Performance optimization notes

### 📄 DASHBOARD_API_CATALOG.md
Quick reference guide with:
- Endpoint table (path, method, parameters, response fields)
- Scope enforcement rules (Admin=system-wide, CRM=assigned clients, Auditor=assigned audits)
- NestJS implementation examples (controllers, services, DTOs)
- Security guidelines (JWT parameter extraction, privilege escalation prevention)
- Common parameters and their behavior

**Usage**: Backend developers should reference these files when implementing dashboard controllers and services.

---

## Support

For questions or issues, refer to:
- Main README: `../../README.md`
- Backend docs: `../README.md`
- API documentation: `../API_DOCS.md`
- Dashboard queries: `DASHBOARD_QUERIES.sql`
- API catalog: `DASHBOARD_API_CATALOG.md`

