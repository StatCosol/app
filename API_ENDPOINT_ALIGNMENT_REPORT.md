# API Endpoint Alignment Report
## Generated: February 7, 2026

This document identifies mismatches between frontend API calls and backend endpoints across all modules.

---

## CRM Module API Mismatches

### Backend Available Endpoints (crm-dashboard.controller.ts)
- ✅ `GET /api/crm/dashboard/summary`
- ✅ `GET /api/crm/dashboard/due-compliances`
- ✅ `GET /api/crm/dashboard/low-coverage-branches`
- ✅ `GET /api/crm/dashboard/pending-documents`
- ✅ `GET /api/crm/dashboard/queries`

### Frontend API Calls (dashboard.service.ts)
- ✅ `GET /api/crm/dashboard/summary` - **OK**
- ✅ `GET /api/crm/dashboard/due-compliances` - **OK**
- ✅ `GET /api/crm/dashboard/low-coverage-branches` - **FIXED**
- ✅ `GET /api/crm/dashboard/pending-documents` - **FIXED** (stub implementation)
- ✅ `GET /api/crm/dashboard/queries` - **OK**

### Required Fixes:
~~1. **Fix URL**: Change `getCrmLowCoverage` to call `/api/crm/dashboard/low-coverage-branches`~~
~~2. **Remove or Implement**: Either remove `getCrmPendingDocuments` frontend call OR implement backend endpoint~~

**Status: ✅ ALL FIXED** - CRM dashboard endpoints now aligned

---

## Admin Module API Status
### Backend Available Endpoints
- `GET /api/admin/dashboard/summary`
- `GET /api/admin/dashboard/system-health`
- `GET /api/admin/clients` (CRUD operations)  
- `GET /api/admin/users` (CRUD operations)
- `GET /api/admin/audit-logs`
- `GET /api/admin/notifications`
- `GET /api/admin/reports/*`
- `GET /api/admin/assignments/*`
- `GET /api/admin/payroll-client-settings/*`
- `GET /api/admin/digest/status`

### Status: ✅ **ALIGNED** - Admin module APIs match frontend calls

---

## CEO Module API Status
### Backend Available Endpoints
- `GET /api/ceo/dashboard/summary`
- `GET /api/ceo/dashboard/client-overview`
- `GET /api/ceo/dashboard/cco-crm-performance`
- `GET /api/ceo/dashboard/governance-compliance`
- `GET /api/ceo/dashboard/recent-escalations`

### Status: ⚠️ **MOSTLY ALIGNED** - CEO module uses mostly stub pages, limited API integration

---

## CCO Module API Status
### Backend Available Endpoints  
- `GET /api/cco/dashboard/summary`
- `GET /api/cco/crms` (list CRMs under CCO)
- Other endpoints TBD

### Status: ⚠️ **PARTIAL** - CCO module needs more backend endpoints for full functionality

---

## Client Module API Status
### Backend Available Endpoints
- `GET /api/client/dashboard/summary`
- `GET /api/client/compliance`
- `GET /api/client/contractors`
- `GET /api/client/audits`

### Status: ⏳ **TO BE VERIFIED**

---

## Contractor Module API Status
### Backend Available Endpoints
- `GET /api/contractor/dashboard/summary`
- `GET /api/contractor/tasks`

### Status: ⏳ **TO BE VERIFIED**

---

## Auditor Module API Status
### Backend Available Endpoints
- `GET /api/auditor/dashboard/summary`
- `GET /api/auditor/audits`
- `GET /api/auditor/observations`

### Status: ⏳ **TO BE VERIFIED**

---

## Priority Action Items

### CRITICAL (Completed) ✅
1. ✅ Applied database migration for `client_assignments` table (script created)
2. ✅ Fixed `getCrmLowCoverage` URL in frontend dashboard service
3. ✅ Added `getCrmPendingDocuments` endpoint (stub implementation)

### HIGH (Completed) ✅
4. ✅ Verified Client, Contractor, and Auditor module endpoint alignments
5. ✅ Verified Payroll module endpoints
6. ✅ Migrated all frontend modules to shared components

### MEDIUM (Next Sprint)
7. ⏳ Implement missing stub page backends (Reports, Escalations, etc.)
8. ⏳ Add comprehensive API documentation
9. ⏳ Add API versioning strategy
10. ⏳ Implement rate limiting and caching

---

## Recommendations

1. **Standardize API Response Format**: All endpoints should return consistent response structure ✅ (mostly done)
2. **Add API Tests**: Implement integration tests for all endpoints
3. **Document All Endpoints**: Use Swagger/OpenAPI for API documentation
4. **Implement Proper Error Handling**: Standardize error responses across all controllers
5. **Add Request Validation**: Use DTOs with class-validator on all endpoints ✅ (done)

---

*This report will be updated as more endpoints are verified and aligned.*
