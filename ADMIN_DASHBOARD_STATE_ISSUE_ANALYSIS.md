# Admin Dashboard State Filter Issue Analysis

**Date:** 2026-02-12
**Issue:** Dashboard showing all states in dropdown, but selected state filtering only returns branches from 2 states
**Status:** Analysis Complete - Root Cause Identified

---

## Problem Summary

The admin dashboard has a state selector dropdown that displays **all available states**, but when a state is selected, the dashboard only returns data from **2 specific states** instead of filtering by the selected state.

### Symptoms
1. ✅ State dropdown shows all states (working)
2. ❌ Selecting a state doesn't filter results properly
3. ❌ Results only come from 2 states regardless of selection
4. ❌ Selected state parameter is ignored in filtering

---

## Root Cause Analysis

### Issue #1: Admin Dashboard Controller Doesn't Support State Filtering

**File:** `backend/src/dashboard/admin-dashboard.controller.ts`

**Current Implementation:**
```typescript
@Get('summary')
async summary(
  @Query('clientId') clientId?: string,
  @Query('stateCode') stateCode?: string,  // ← Parameter declared but NEVER USED
  @Query('from') from?: string,
  @Query('to') to?: string,
) {
  const clients = await this.safeCountActive('clients');
  const branches = await this.safeCountActive('client_branches');

  return {
    clients,
    branches,
    avgCompliancePercent: 0,
    // ... other fields ...
  };
}
```

**Problem:**
- `stateCode` query parameter is accepted but **completely ignored**
- No filtering by state is performed
- The counts don't consider state selection
- The response is always the same regardless of selected state

### Issue #2: SQL Queries Support State Filtering But Aren't Being Used

**File:** `backend/src/admin/sql/admin-dashboard.sql.ts`

The SQL queries **DO support** state filtering with parameter `$2`:

```sql
WITH filtered_clients AS (
  SELECT c.id
  FROM clients c
  WHERE c.is_active = TRUE
    AND ($1::uuid IS NULL OR c.id = $1)
    AND ($2::text IS NULL OR c.state = $2)  -- ← State filter here!
),
```

**Status:** These optimized SQL queries exist but are **not being called** by the controller

### Issue #3: No Endpoint to Get Available States

**Missing:** There is no API endpoint to dynamically fetch all distinct states from the database

**Current Status:**
- Branches have `stateCode` column
- Clients table appears to have `state` column (from SQL queries)
- But no `/api/admin/dashboard/states` or similar endpoint exists
- Frontend likely hardcoding state list

### Issue #4: Table Name Mismatch

The SQL queries reference different table names:
- `client_branches` table (from BranchEntity)
- But SQL might be expecting `branches` table
- After schema fixes (20260212_CRITICAL_FIXES.sql), table is renamed to `branches`

---

## Detailed Issue Breakdown

### Frontend Problem
**Likely Behavior:**
```javascript
// Frontend is probably hardcoding states
const states = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', ...]; // All US states hardcoded

// Or fetching from somewhere else
const states = await fetchStates(); // Not from dashboard API

// When user selects a state
const response = await fetch(`/api/admin/dashboard/summary?stateCode=${selectedState}`);
```

### Backend Problem
```typescript
// Current: Ignoring the stateCode parameter
async summary(
  @Query('clientId') clientId?: string,
  @Query('stateCode') stateCode?: string,  // Accepted but ignored!
  @Query('from') from?: string,
  @Query('to') to?: string,
) {
  // WRONG: Always return all data
  const clients = await this.safeCountActive('clients');
  const branches = await this.safeCountActive('client_branches');
  // ...
}

// Should be: Using the stateCode parameter
async summary(
  @Query('clientId') clientId?: string,
  @Query('stateCode') stateCode?: string,
  @Query('from') from?: string,
  @Query('to') to?: string,
) {
  // RIGHT: Use ADMIN_DASHBOARD_SUMMARY_SQL with stateCode
  const data = await this.dataSource.query(
    ADMIN_DASHBOARD_SUMMARY_SQL,
    [clientId || null, stateCode || null, from, to, 30]
  );
  // ...
}
```

---

## Why Only 2 States Are Showing

The "2 states" behavior suggests:

1. **Hypothesis 1:** Frontend has hardcoded states but data only exists for 2
   - User selects state (e.g., "CA")
   - Backend ignores it, returns ALL data
   - Branches table only has data for 2 states
   - Frontend filters client-side with selected state
   - Shows only 2 states' data

2. **Hypothesis 2:** Database only has 2 states' branches
   - Most branches don't have `stateCode` set
   - Only 2 branches have state values
   - Frontend is showing those as results

3. **Hypothesis 3:** Frontend filtering is working, but backend returns wrong data
   - Backend returns all branches (not filtered by state)
   - Frontend filters to only show selected state
   - But database only has 2 states with data
   - Results show only 2 states

---

## Files Involved

### Controllers (Missing State Filtering)
- ✗ `backend/src/dashboard/admin-dashboard.controller.ts` - No state parameter usage

### Services (Not Used)
- ⚠️ `backend/src/crm/crm-dashboard.service.ts` - Has proper filtering patterns
- ⚠️ `backend/src/auditor/auditor-dashboard.service.ts` - Has proper filtering patterns

### SQL Queries (Exist But Unused)
- ⚠️ `backend/src/admin/sql/admin-dashboard.sql.ts` - State filtering defined but not called

### Entities
- ✓ `backend/src/branches/entities/branch.entity.ts` - Has `stateCode` column
- ✓ Clients table - Has `state` column (from SQL references)

---

## Current Flow vs Intended Flow

### Current (Broken) Flow
```
Frontend
  ↓
User selects state "CA"
  ↓
Frontend sends: GET /api/admin/dashboard/summary?stateCode=CA
  ↓
AdminDashboardController.summary()
  ↓
Ignores stateCode parameter ❌
  ↓
Queries ALL branches (no filter)
  ↓
Returns data for all states
  ↓
Frontend filters client-side (if implemented)
  ↓
Shows only branches where stateCode = "CA"
  ↓
But database only has 2 states!
  ↓
Result: Only 2 states shown
```

### Intended (Fixed) Flow
```
Frontend
  ↓
User selects state "CA"
  ↓
Frontend sends: GET /api/admin/dashboard/summary?stateCode=CA
  ↓
AdminDashboardController.summary()
  ↓
Uses stateCode parameter ✓
  ↓
Queries branches WHERE state_code = 'CA'
  ↓
Returns data for CA only
  ↓
Frontend displays results
  ↓
Shows all CA branches (correct filtering)
```

---

## Data Schema Issue

### Branch stateCode Column
```typescript
@Column({
  name: 'statecode',  // ← Lowercase in database
  type: 'character varying',
  length: 10,
  nullable: true,
})
stateCode: string | null;  // ← camelCase in entity
```

**Table:** `client_branches`
**Column:** `statecode` (NOT NULL constraint missing)
**Type:** VARCHAR(10)

### Client State Column (inferred from SQL)
```sql
AND ($2::text IS NULL OR c.state = $2)
```

**Table:** `clients`
**Column:** `state` (assumed, not verified)
**Type:** TEXT

**⚠️ Issue:** Column names might not match between clients and branches
- Clients: `state`
- Branches: `stateCode`

---

## Solution Options

### Option 1: Simple Fix (30 minutes)
**Implement state filtering in existing controller**

Update `admin-dashboard.controller.ts`:
```typescript
@Get('summary')
async summary(
  @Query('clientId') clientId?: string,
  @Query('stateCode') stateCode?: string,
  @Query('from') from?: string,
  @Query('to') to?: string,
) {
  // Use raw SQL with proper filtering
  const [result] = await this.dataSource.query(
    ADMIN_DASHBOARD_SUMMARY_SQL,
    [clientId || null, stateCode || null, from || null, to || null, 30]
  );
  return result;
}
```

**Pros:**
- Quick fix
- Uses existing SQL queries
- Minimal code change

**Cons:**
- Doesn't add states endpoint
- Frontend still hardcoding states (if that's the case)

### Option 2: Complete Solution (2 hours)
**Add proper state filtering + states endpoint**

Add to `admin-dashboard.controller.ts`:
```typescript
@Get('states')
async getAvailableStates() {
  const states = await this.dataSource.query(`
    SELECT DISTINCT state_code
    FROM client_branches
    WHERE is_active = TRUE
      AND state_code IS NOT NULL
    ORDER BY state_code ASC
  `);
  return states.map(s => s.state_code);
}

@Get('summary')
async summary(...) {
  // Implement filtering as in Option 1
}
```

**Pros:**
- Complete solution
- Dynamic states from database
- Frontend doesn't need hardcoding
- Proper separation of concerns

**Cons:**
- Slightly more code
- Needs frontend update

### Option 3: Comprehensive Refactor (4-6 hours)
**Refactor to use dashboard service layer properly**

Create `admin-dashboard.service.ts`:
```typescript
@Injectable()
export class AdminDashboardService {
  async getSummary(
    clientId?: string,
    stateCode?: string,
    from?: string,
    to?: string,
  ) {
    return this.dataSource.query(
      ADMIN_DASHBOARD_SUMMARY_SQL,
      [clientId || null, stateCode || null, from || null, to || null, 30]
    );
  }

  async getAvailableStates() {
    // ...
  }
}
```

**Pros:**
- Proper architecture
- Matches CRM/Auditor dashboard patterns
- Testable
- Maintainable

**Cons:**
- More refactoring
- More code changes
- Requires testing

---

## Verification Steps

### Step 1: Check Database State Data
```sql
-- Check distinct state codes in branches
SELECT DISTINCT state_code FROM client_branches
WHERE state_code IS NOT NULL
ORDER BY state_code;

-- Should return more than 2 states (if data exists)

-- Check count of branches per state
SELECT state_code, COUNT(*) as count
FROM client_branches
WHERE state_code IS NOT NULL
GROUP BY state_code
ORDER BY count DESC;
```

### Step 2: Check API Response
```bash
# Get all states
curl "http://localhost:3000/api/admin/dashboard/summary"

# Should show branches from all states with state_code

# Select CA
curl "http://localhost:3000/api/admin/dashboard/summary?stateCode=CA"

# Should show ONLY CA branches (currently broken)
```

### Step 3: Check Frontend
```javascript
// Check if frontend is hardcoding states
console.log(statesDropdown); // Likely has all US states

// Check if frontend filtering locally
const branches = response.filter(b => b.stateCode === selectedState);
```

---

## Recommended Solution

**Recommended:** Option 2 (Complete Solution) - Balance of thoroughness and effort

### Implementation Steps

1. **Update AdminDashboardController** (30 min)
   ```typescript
   // Add states endpoint
   @Get('states')
   async getAvailableStates() {...}

   // Fix summary endpoint
   @Get('summary')
   async summary(...) {...}
   ```

2. **Update Frontend** (30 min)
   ```javascript
   // Fetch states from API instead of hardcoding
   const states = await fetch('/api/admin/dashboard/states');

   // Pass stateCode when filtering
   const data = await fetch(`/api/admin/dashboard/summary?stateCode=${selected}`);
   ```

3. **Test State Filtering** (30 min)
   ```sql
   -- Verify database has state data
   -- Verify API returns filtered results
   -- Verify frontend displays correctly
   ```

4. **Total Time:** ~90 minutes

---

## Testing Plan

### Manual Testing
```bash
# Get summary without state filter (baseline)
curl "http://localhost:3000/api/admin/dashboard/summary" | jq '.branches'
# Expected: All branches

# Get available states
curl "http://localhost:3000/api/admin/dashboard/states" | jq '.'
# Expected: List of distinct states

# Get summary with specific state
curl "http://localhost:3000/api/admin/dashboard/summary?stateCode=CA" | jq '.branches'
# Expected: Only CA branches
```

### Automated Testing
```typescript
it('should filter branches by state', async () => {
  const result = await controller.summary(null, 'CA', null, null);
  expect(result.branches).toBeLessThanOrEqual(totalBranches);
  expect(result).toHaveProperty('branches');
});
```

---

## Priority & Impact

**Priority:** MEDIUM
- Dashboard is functional (shows some data)
- State filtering is not critical for MVP
- But confusing UX

**Impact:**
- Users can't filter by state effectively
- Reports may be misleading
- Only 2 states have data visibility

**Effort:** LOW (30-90 minutes)

---

## Summary

### What's Working ✅
- SQL queries support state filtering
- State parameter is accepted in API
- Branch entity has stateCode column
- State dropdown displays (from somewhere)

### What's Broken ❌
- AdminDashboardController ignores stateCode parameter
- State filtering is not implemented in controller
- No endpoint to dynamically fetch states
- Results only show 2 states regardless of selection

### What Needs to Happen
1. Implement state filtering in AdminDashboardController.summary()
2. Add states endpoint to AdminDashboardController
3. Update frontend to use dynamic states
4. Verify database has state data
5. Test state filtering end-to-end

### Next Steps
1. Implement Option 2 (Complete Solution)
2. Update both backend and frontend
3. Run verification queries
4. Test manually
5. Deploy and monitor

---

## Code Changes Required

See next section: "Implementation Details" (if you want to proceed with fixes)
