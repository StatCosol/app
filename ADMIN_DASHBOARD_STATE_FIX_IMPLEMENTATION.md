# Admin Dashboard State Filter - Implementation Guide

**Date:** 2026-02-12
**Issue:** State filtering not working on admin dashboard
**Solution:** Option 2 - Complete Solution (state filtering + dynamic states endpoint)
**Estimated Time:** 90 minutes
**Difficulty:** MEDIUM

---

## Overview

This guide provides step-by-step implementation to fix the admin dashboard state filtering issue.

### What Will Be Fixed
1. ✅ State parameter will actually filter results
2. ✅ Dynamic states endpoint will be added
3. ✅ Frontend can fetch states from API
4. ✅ Proper state filtering on all dashboard endpoints

---

## Step 1: Update Admin Dashboard Controller (30 min)

### File: `backend/src/dashboard/admin-dashboard.controller.ts`

#### Step 1a: Import the SQL queries

At the top of the file, add imports:

```typescript
import { ADMIN_DASHBOARD_SUMMARY_SQL, ADMIN_ESCALATIONS_SQL, ADMIN_ASSIGNMENTS_ATTENTION_SQL } from '../admin/sql/admin-dashboard.sql';
```

#### Step 1b: Add States Endpoint

After the `clientsMinimal()` method, add a new endpoint:

```typescript
@Roles('ADMIN', 'CEO', 'CCO')
@Get('states')
async getAvailableStates() {
  try {
    // Get distinct states from branches table
    const states = await this.dataSource.query(`
      SELECT DISTINCT state_code
      FROM client_branches
      WHERE state_code IS NOT NULL
        AND isactive = TRUE
        AND isdeleted = FALSE
      ORDER BY state_code ASC
    `);

    // Return as simple array
    return states.map((s: any) => s.state_code).filter(Boolean);
  } catch {
    return []; // Return empty array on error
  }
}
```

#### Step 1c: Fix Summary Endpoint

Replace the current `summary()` method with:

```typescript
@Roles('ADMIN', 'CEO', 'CCO')
@Get('summary')
async summary(
  @Query('clientId') clientId?: string,
  @Query('stateCode') stateCode?: string,
  @Query('from') from?: string,
  @Query('to') to?: string,
) {
  try {
    // Use the SQL query with proper parameter binding
    const [result] = await this.dataSource.query(
      ADMIN_DASHBOARD_SUMMARY_SQL,
      [
        clientId || null,
        stateCode || null,
        from ? new Date(from) : null,
        to ? new Date(to) : null,
        30, // windowDays for "due soon"
      ],
    );

    // Transform snake_case to camelCase for response
    return {
      clientsCount: result?.clients_count ?? 0,
      branchesCount: result?.branches_count ?? 0,
      slaScorePct: result?.sla_score_pct ?? 0,
      slaStatus: result?.sla_status ?? 'RED',
      overdueAuditsCount: result?.overdue_audits_count ?? 0,
      dueSoonAuditsCount: result?.due_soon_audits_count ?? 0,
      unreadNotificationsCount: result?.unread_notifications_count ?? 0,
    };
  } catch (error) {
    console.error('Dashboard summary error:', error);
    // Fallback response
    return {
      clientsCount: 0,
      branchesCount: 0,
      slaScorePct: 0,
      slaStatus: 'RED',
      overdueAuditsCount: 0,
      dueSoonAuditsCount: 0,
      unreadNotificationsCount: 0,
    };
  }
}
```

#### Step 1d: Add Other Dashboard Endpoints (Optional but Recommended)

```typescript
@Roles('ADMIN', 'CEO', 'CCO')
@Get('escalations')
async getEscalations(
  @Query('clientId') clientId?: string,
  @Query('stateCode') stateCode?: string,
  @Query('from') from?: string,
  @Query('to') to?: string,
) {
  try {
    return await this.dataSource.query(
      ADMIN_ESCALATIONS_SQL,
      [
        clientId || null,
        stateCode || null,
        from ? new Date(from) : null,
        to ? new Date(to) : null,
      ],
    );
  } catch {
    return [];
  }
}

@Roles('ADMIN', 'CEO', 'CCO')
@Get('assignments-attention')
async getAssignmentsAttention(
  @Query('clientId') clientId?: string,
  @Query('stateCode') stateCode?: string,
) {
  try {
    return await this.dataSource.query(
      ADMIN_ASSIGNMENTS_ATTENTION_SQL,
      [clientId || null, stateCode || null],
    );
  } catch {
    return [];
  }
}
```

---

## Step 2: Verify SQL Queries Are Correct (15 min)

### File: `backend/src/admin/sql/admin-dashboard.sql.ts`

The SQL queries should already support state filtering. Verify they have the `$2::text IS NULL OR ... = $2` pattern:

✅ **ADMIN_DASHBOARD_SUMMARY_SQL** - Line 17: Has state filter
✅ **ADMIN_ESCALATIONS_SQL** - Line 92: Has state filter
✅ **ADMIN_ASSIGNMENTS_ATTENTION_SQL** - Line 152: Has state filter

If any are missing, add the state filter parameter:

```sql
AND ($2::text IS NULL OR c.state = $2)  -- For clients table
OR
AND ($2::text IS NULL OR b.state_code = $2)  -- For branches table
```

---

## Step 3: Fix Frontend State Dropdown (30 min)

### File: `frontend/src/pages/AdminDashboard.tsx` (or similar)

#### Step 3a: Update State Loading

**Before:**
```typescript
// Hardcoded states (BAD)
const states = ['AL', 'AK', 'AZ', 'AR', 'CA', ...];
```

**After:**
```typescript
// Fetch from API (GOOD)
const [states, setStates] = useState<string[]>([]);

useEffect(() => {
  const fetchStates = async () => {
    try {
      const response = await fetch('/api/admin/dashboard/states');
      const data = await response.json();
      setStates(data);
    } catch {
      setStates([]); // Fallback empty
    }
  };
  fetchStates();
}, []);
```

#### Step 3b: Update State Filter Handler

**Before:**
```typescript
// State selection is ignored
const handleStateChange = (state: string) => {
  // Nothing happens - state is not passed to API
  loadDashboard();
};
```

**After:**
```typescript
// State is passed to API
const handleStateChange = (state: string) => {
  setSelectedState(state);
  loadDashboard(state); // Pass selected state
};

const loadDashboard = async (state?: string) => {
  try {
    const params = new URLSearchParams();
    if (state) params.append('stateCode', state);

    const response = await fetch(`/api/admin/dashboard/summary?${params}`);
    const data = await response.json();
    setDashboardData(data);
  } catch (error) {
    console.error('Error loading dashboard:', error);
  }
};
```

#### Step 3c: Update State Dropdown JSX

```typescript
<select
  value={selectedState}
  onChange={(e) => handleStateChange(e.target.value)}
  className="state-selector"
>
  <option value="">All States</option>
  {states.map((state) => (
    <option key={state} value={state}>
      {state}
    </option>
  ))}
</select>
```

---

## Step 4: Database Verification (15 min)

### Check If State Data Exists

Run these queries to verify:

```sql
-- 1. Check distinct states in branches
SELECT DISTINCT state_code
FROM client_branches
WHERE state_code IS NOT NULL
  AND isactive = TRUE
  AND isdeleted = FALSE
ORDER BY state_code;

-- Expected: List of states (should be more than 2)
-- If EMPTY: Check if statecode column exists
```

```sql
-- 2. Count branches per state
SELECT state_code, COUNT(*) as count
FROM client_branches
WHERE state_code IS NOT NULL
  AND isactive = TRUE
  AND isdeleted = FALSE
GROUP BY state_code
ORDER BY count DESC;

-- Expected: Multiple states with branch counts
```

```sql
-- 3. Check if statecode column has right casing
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'client_branches'
  AND column_name ILIKE '%state%';

-- Expected: Column named 'statecode' (lowercase)
```

### If State Data is Missing

```sql
-- Populate some test state codes
UPDATE client_branches
SET state_code = 'CA'
WHERE state_code IS NULL
LIMIT 5;

UPDATE client_branches
SET state_code = 'NY'
WHERE state_code IS NULL AND id != (SELECT id FROM client_branches LIMIT 1)
LIMIT 5;

-- Now run the SELECT DISTINCT query again
```

---

## Step 5: Testing (15 min)

### Manual API Testing

```bash
# 1. Test states endpoint
curl "http://localhost:3000/api/admin/dashboard/states"
# Expected: ["CA", "NY", "TX", ...]

# 2. Test summary without state filter
curl "http://localhost:3000/api/admin/dashboard/summary"
# Expected: All branches data

# 3. Test summary with state filter
curl "http://localhost:3000/api/admin/dashboard/summary?stateCode=CA"
# Expected: Only CA branches

# 4. Test with client and state
curl "http://localhost:3000/api/admin/dashboard/summary?clientId=<uuid>&stateCode=CA"
# Expected: Only CA branches from that client
```

### Automated Testing

```typescript
// tests/admin-dashboard.spec.ts
describe('AdminDashboardController', () => {
  let controller: AdminDashboardController;

  it('should return available states', async () => {
    const states = await controller.getAvailableStates();
    expect(Array.isArray(states)).toBe(true);
    expect(states.length).toBeGreaterThan(0);
  });

  it('should filter by state code', async () => {
    const result = await controller.summary(
      null,
      'CA', // stateCode filter
      null,
      null,
    );
    // Verify results are for CA only
    expect(result.stateFiltered).toBe('CA');
  });

  it('should return all states when no filter', async () => {
    const result = await controller.summary(
      null,
      null, // no state filter
      null,
      null,
    );
    // Should have more branches than filtered results
    expect(result.branchesCount).toBeGreaterThan(0);
  });
});
```

---

## Step 6: Rebuild and Deploy (15 min)

### Build Backend
```bash
cd backend
npm run build
```

### Test Locally
```bash
npm run dev
# Visit: http://localhost:3000/api/admin/dashboard/states
# Should return state list
```

### Deploy
```bash
# Standard deployment process
git add .
git commit -m "fix: implement state filtering in admin dashboard"
npm run deploy
```

---

## Checklist

### Backend Changes
- [ ] Import SQL queries in admin-dashboard.controller.ts
- [ ] Add `getAvailableStates()` endpoint
- [ ] Update `summary()` method to use SQL queries with state parameter
- [ ] Add `getEscalations()` endpoint (optional)
- [ ] Add `getAssignmentsAttention()` endpoint (optional)
- [ ] Test backend API endpoints
- [ ] Build without errors

### Frontend Changes
- [ ] Replace hardcoded states with API fetch
- [ ] Update state change handler to pass state to API
- [ ] Update dashboard data loading to include state parameter
- [ ] Test state selection works
- [ ] Verify data updates when state changes

### Database Changes
- [ ] Verify state data exists in client_branches
- [ ] Verify statecode column spelling (lowercase)
- [ ] Update test data if needed

### Testing
- [ ] Manual API test: GET /api/admin/dashboard/states
- [ ] Manual API test: GET /api/admin/dashboard/summary (no filter)
- [ ] Manual API test: GET /api/admin/dashboard/summary?stateCode=CA
- [ ] Frontend test: State dropdown loads
- [ ] Frontend test: Selecting state filters results
- [ ] Frontend test: Clearing filter shows all states

---

## Troubleshooting

### Issue: SQL Query Errors

**Symptom:** 500 error when calling summary endpoint
**Solution:** Check SQL queries in admin-dashboard.sql.ts
- Verify parameter count matches (should be 5 for ADMIN_DASHBOARD_SUMMARY_SQL)
- Check table and column names exist
- Check state_code vs statecode vs state column naming

### Issue: No States in Dropdown

**Symptom:** States endpoint returns empty array
**Solution:**
```sql
SELECT * FROM client_branches LIMIT 1;
-- Check if statecode column is NULL for all rows
-- Check column casing (should be 'statecode' not 'stateCode')
```

### Issue: State Filter Not Working

**Symptom:** Selecting state doesn't change results
**Solution:**
- Check frontend is actually passing `stateCode` parameter
- Check backend is receiving parameter: Add `console.log(stateCode)`
- Verify SQL query has state filter: Line 17 in admin-dashboard.sql.ts
- Check database has state values

### Issue: Column Name Mismatch

**Symptom:** Database error about unknown column
**Solution:**
- Check exact column name:
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'client_branches'
  ```
- Update SQL queries to use correct name
- Note: TypeORM entity uses `statecode`, SQL should too

---

## Success Criteria

After implementation, verify:

✅ GET `/api/admin/dashboard/states` returns list of states
✅ GET `/api/admin/dashboard/summary` returns all data
✅ GET `/api/admin/dashboard/summary?stateCode=CA` returns CA data only
✅ Frontend state dropdown loads from API
✅ Selecting state in frontend filters results
✅ Clearing state selection shows all data
✅ State filtering works with clientId and date filters
✅ No errors in browser console
✅ No errors in server logs

---

## Time Breakdown

| Task | Time | Status |
|------|------|--------|
| Backend Controller Updates | 20 min | Implementation |
| SQL Query Verification | 10 min | Verification |
| Frontend State Dropdown | 25 min | Implementation |
| Database Verification | 15 min | Testing |
| Manual Testing | 10 min | Testing |
| Rebuild & Deploy | 10 min | Deployment |
| **Total** | **90 min** | |

---

## Next Steps After Fix

1. Monitor dashboard usage to ensure state filtering works
2. Update documentation if there's admin user guide
3. Consider adding state analytics/reports
4. Add state grouping to other dashboard views
5. Performance test with large datasets

---

**Status:** Ready for Implementation
**Difficulty:** MEDIUM
**Risk:** LOW (isolated to admin dashboard)
