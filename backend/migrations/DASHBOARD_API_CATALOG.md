# Dashboard API Endpoint Catalog

Quick reference for dashboard API implementation.

## 📋 Overview

All dashboard queries are documented in `DASHBOARD_QUERIES.sql`. This catalog provides a quick index for backend developers implementing NestJS controllers and services.

---

## 🔴 Admin Dashboard (Control Tower)

### Base Path: `/api/admin/dashboard`

| Endpoint | Method | Purpose | Key Parameters | Response Fields |
|----------|--------|---------|----------------|-----------------|
| `/summary` | GET | Admin KPI summary | `client_id`, `state`, `from_date`, `to_date`, `window_days` | `clients_count`, `branches_count`, `sla_score_pct`, `sla_status`, `overdue_audits_count`, `due_soon_audits_count`, `unread_notifications_count` |
| `/escalations` | GET | Escalation queue (overdue audits + rotations) | `client_id`, `state`, `from_date`, `to_date` | Array: `issue_type`, `reason`, `client_name`, `owner_role`, `owner_name`, `days_delayed` |
| `/assignments-attention` | GET | Assignments needing rotation | `client_id`, `state` | Array: `assignment_id`, `client_name`, `assignment_type`, `assigned_to`, `rotation_due_on`, `days_overdue` |
| `/system-health` | GET | System health metrics | None | `inactive_users_15d`, `unassigned_clients_crm`, `unassigned_clients_auditor`, `failed_notifications_7d` |

### Scope
- **System-wide**: Admin sees all active clients, optionally filtered by `client_id` or `state`
- **No user-based scoping**: Admin has full visibility

---

## 🔵 CRM Dashboard (Compliance Owner)

### Base Path: `/api/crm/dashboard`

| Endpoint | Method | Purpose | Key Parameters | Response Fields |
|----------|--------|---------|----------------|-----------------|
| `/summary` | GET | CRM operational KPIs | `crm_user_id` ⚠️, `client_id`, `from_date`, `to_date`, `window_days` | `assigned_clients_count`, `assigned_branches_count`, `compliance_coverage_pct`, `overdue_compliances_count`, `due_soon_compliances_count`, `open_compliance_queries_count` |
| `/due-compliances` | GET | Compliance items by tab | `crm_user_id` ⚠️, `tab` (OVERDUE\|DUE_SOON\|THIS_MONTH), `client_id`, `from_date`, `to_date`, `window_days` | Array: `schedule_id`, `client_name`, `branch_name`, `category`, `compliance_item`, `risk`, `due_date`, `days_overdue`, `status` |
| `/low-coverage-branches` | GET | Branches with low compliance coverage | `crm_user_id` ⚠️, `client_id`, `from_date`, `to_date` | Array: `client_name`, `branch_name`, `coverage_pct`, `overdue_count`, `high_risk_pending` |
| `/pending-documents` | GET | Document requests pending | `crm_user_id` ⚠️, `client_id`, `from_date`, `to_date` | Array: `request_id`, `client_name`, `branch_name`, `document_type`, `requested_on`, `pending_days` |
| `/queries` | GET | Compliance queries inbox | `crm_user_id` ⚠️, `status` (UNREAD\|READ\|CLOSED), `from_date`, `to_date` | Array: `query_id`, `from_role`, `from_name`, `client_name`, `subject`, `ageing_days`, `status` |

### Scope
- **User-scoped**: CRM sees ONLY clients assigned via `client_assignments` table
- **Critical**: All queries use `crm_clients` CTE filtering by `crm_user_id`
- **Enforcement**: `WHERE ca.status='ACTIVE' AND ca.assignment_type='CRM' AND ca.assigned_user_id = :crm_user_id`

⚠️ **REQUIRED**: `crm_user_id` must be passed from auth token (current user ID)

---

## 🟢 Auditor Dashboard (Audit Execution)

### Base Path: `/api/auditor/dashboard`

| Endpoint | Method | Purpose | Key Parameters | Response Fields |
|----------|--------|---------|----------------|-----------------|
| `/summary` | GET | Auditor execution KPIs | `auditor_user_id` ⚠️, `client_id`, `from_date`, `to_date`, `window_days` | `assigned_audits_count`, `overdue_audits_count`, `due_soon_audits_count`, `observations_open_count`, `high_risk_open_count`, `reports_pending_count` |
| `/audits` | GET | Assigned audits by tab | `auditor_user_id` ⚠️, `tab` (ACTIVE\|OVERDUE\|DUE_SOON\|COMPLETED), `client_id`, `from_date`, `to_date`, `window_days` | Array: `audit_id`, `client_name`, `branch_name`, `audit_type`, `audit_name`, `due_date`, `status`, `progress_pct` |
| `/observations` | GET | Observations pending closure | `auditor_user_id` ⚠️, `status` (OPEN\|IN_PROGRESS), `risk` (HIGH\|MEDIUM\|LOW), `client_id` | Array: `observation_id`, `audit_id`, `client_name`, `branch_name`, `title`, `risk`, `owner_role`, `ageing_days` |
| `/evidence-pending` | GET | Evidence/documents pending | `auditor_user_id` ⚠️ | Array: `request_id`, `client_name`, `branch_name`, `evidence_name`, `requested_on`, `pending_days` |
| `/reports` | GET | Reports pending submission | `auditor_user_id` ⚠️, `status` (PENDING_SUBMISSION\|SUBMITTED) | Array: `audit_id`, `client_name`, `branch_name`, `due_date`, `status` |

### Scope
- **User-scoped**: Auditor sees ONLY audits assigned to them
- **Critical**: All queries use `my_audits` CTE filtering by `auditor_user_id`
- **Enforcement**: `WHERE a.assigned_auditor_id = :auditor_user_id`

⚠️ **REQUIRED**: `auditor_user_id` must be passed from auth token (current user ID)

---

## 🔧 Implementation Guidelines

### 1. Parameter Extraction (NestJS)

```typescript
// Admin endpoint (no user scoping)
@Get('summary')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
async getAdminSummary(
  @Query('clientId') clientId?: string,
  @Query('state') state?: string,
  @Query('fromDate') fromDate?: string,
  @Query('toDate') toDate?: string,
  @Query('windowDays') windowDays: number = 30
) {
  return this.adminDashboardService.getSummary({
    client_id: clientId || null,
    state: state || null,
    from_date: fromDate || null,
    to_date: toDate || null,
    window_days: windowDays
  });
}

// CRM endpoint (user-scoped)
@Get('summary')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
async getCrmSummary(
  @Req() req,  // Extract user from JWT
  @Query('clientId') clientId?: string,
  @Query('fromDate') fromDate?: string,
  @Query('toDate') toDate?: string,
  @Query('windowDays') windowDays: number = 30
) {
  return this.crmDashboardService.getSummary({
    crm_user_id: req.user.id,  // ⚠️ From auth token
    client_id: clientId || null,
    from_date: fromDate || null,
    to_date: toDate || null,
    window_days: windowDays
  });
}

// Auditor endpoint (user-scoped)
@Get('summary')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('AUDITOR')
async getAuditorSummary(
  @Req() req,  // Extract user from JWT
  @Query('clientId') clientId?: string,
  @Query('fromDate') fromDate?: string,
  @Query('toDate') toDate?: string,
  @Query('windowDays') windowDays: number = 30
) {
  return this.auditorDashboardService.getSummary({
    auditor_user_id: req.user.id,  // ⚠️ From auth token
    client_id: clientId || null,
    from_date: fromDate || null,
    to_date: toDate || null,
    window_days: windowDays
  });
}
```

### 2. Query Execution (TypeORM)

```typescript
// Example service method
async getSummary(params: AdminSummaryParams): Promise<AdminSummaryDto> {
  const query = `
    WITH filtered_clients AS (...)
    SELECT ... FROM ...
  `;
  
  const result = await this.dataSource.query(query, [
    params.client_id,
    params.state,
    params.from_date,
    params.to_date,
    params.window_days
  ]);
  
  return result[0]; // Single row result
}

async getEscalations(params: AdminEscalationParams): Promise<EscalationDto[]> {
  const query = `...`;
  return this.dataSource.query(query, [
    params.client_id,
    params.state,
    params.from_date,
    params.to_date
  ]);
}
```

### 3. Security Enforcement

⚠️ **CRITICAL**:
- **Admin**: No user-based scoping, rely on `@Roles('ADMIN')` guard
- **CRM**: ALWAYS pass `req.user.id` as `crm_user_id` - NEVER from query params
- **Auditor**: ALWAYS pass `req.user.id` as `auditor_user_id` - NEVER from query params

```typescript
// ❌ WRONG - Allows privilege escalation
@Get('summary')
async getCrmSummary(@Query('crmUserId') crmUserId: string) {
  return this.service.getSummary({ crm_user_id: crmUserId });
}

// ✅ CORRECT - Enforces user scope from JWT
@Get('summary')
async getCrmSummary(@Req() req) {
  return this.service.getSummary({ crm_user_id: req.user.id });
}
```

---

## 📊 Common Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `client_id` | UUID | `NULL` | Filter by specific client (optional) |
| `state` | string | `NULL` | Filter by state (admin only) |
| `from_date` | date | `NULL` | Date range start (YYYY-MM-DD) |
| `to_date` | date | `NULL` | Date range end (YYYY-MM-DD) |
| `window_days` | integer | `30` | Days ahead for "due soon" calculations |
| `tab` | enum | - | Tab filter (OVERDUE, DUE_SOON, etc.) |
| `status` | enum | `NULL` | Status filter (UNREAD, READ, CLOSED, etc.) |
| `risk` | enum | `NULL` | Risk filter (HIGH, MEDIUM, LOW) |

**Date Range Behavior**:
- If both `from_date` and `to_date` are NULL → no filtering
- If only `from_date` → filter `>= from_date`
- If only `to_date` → filter `<= to_date`
- If both → filter `BETWEEN from_date AND to_date`

**Window Days Calculation**:
- Used for "due soon" queries
- Default: 30 days
- Formula: `due_date >= CURRENT_DATE AND due_date < (CURRENT_DATE + window_days)`

---

## 🚀 Performance Tips

1. **Indexes**: All critical indexes already created in schema migration
2. **Limits**: Queries limited to 200-500 rows to prevent performance issues
3. **CTEs**: Used for readability and proper scoping
4. **Parameterized**: All queries use parameter binding (SQL injection safe)
5. **Caching**: Consider Redis caching for summary endpoints (5-15 min TTL)

---

## 📝 DTO Mapping

Each query requires a corresponding TypeScript DTO:

```typescript
// Admin
export class AdminSummaryDto { /* Match query columns */ }
export class AdminEscalationDto { /* ... */ }

// CRM
export class CrmSummaryDto { /* ... */ }
export class CrmComplianceItemDto { /* ... */ }

// Auditor
export class AuditorSummaryDto { /* ... */ }
export class AuditorAuditDto { /* ... */ }
```

See `DASHBOARD_QUERIES.sql` for exact column names and types.

---

## 🔗 Related Files

- `DASHBOARD_QUERIES.sql` - Full SQL queries with comments
- `20260206_governance_model_complete_schema.sql` - Database schema
- `SCHEMA_README.md` - Schema documentation
- Frontend drill-down routes:
  - Admin: [dashboard.component.ts](../../frontend/src/app/pages/admin/dashboard/dashboard.component.ts)
  - CRM: [crm-dashboard.component.ts](../../frontend/src/app/pages/crm/crm-dashboard.component.ts)
  - Auditor: [auditor-dashboard.component.ts](../../frontend/src/app/pages/auditor/auditor-dashboard.component.ts)

---

## 🐛 Testing

```sql
-- Test Admin summary (replace parameters)
-- :client_id = NULL, :state = NULL, :from_date = NULL, :to_date = NULL, :window_days = 30
-- Copy query from DASHBOARD_QUERIES.sql and execute in psql

-- Test CRM scoping (verify user sees only assigned clients)
-- :crm_user_id = '<uuid>', :client_id = NULL, ...

-- Test Auditor scoping (verify user sees only assigned audits)
-- :auditor_user_id = '<uuid>', :client_id = NULL, ...
```

---

**Next Steps**:
1. Create NestJS controller files (`admin-dashboard.controller.ts`, `crm-dashboard.controller.ts`, `auditor-dashboard.controller.ts`)
2. Create service files to execute queries
3. Define DTOs matching query result columns
4. Add guards and role enforcement
5. Test with Postman/Insomnia using real JWT tokens
