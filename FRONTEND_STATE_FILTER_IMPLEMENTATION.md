# Frontend State Filter Implementation Guide

**Date:** 2026-02-12
**Status:** Backend Complete - Frontend Implementation In Progress
**Difficulty:** EASY
**Time to Complete:** 30 minutes

---

## Overview

The frontend needs to be updated to:
1. Fetch states from the new API endpoint
2. Pass the state parameter to dashboard API calls
3. Update state when user selects a state

---

## Step 1: Identify Frontend Files

First, locate your admin dashboard frontend files. Common locations:

```bash
# React
frontend/src/pages/AdminDashboard.tsx
frontend/src/components/AdminDashboard/
frontend/src/services/dashboardService.ts

# Vue
frontend/src/views/AdminDashboard.vue
frontend/src/components/AdminDashboard/

# Angular
frontend/src/app/admin/dashboard/
```

---

## Step 2: Update Dashboard Service/API Client

**File:** `dashboardService.ts` or `api.ts` (wherever API calls are made)

### Current Code (Example)
```typescript
// BEFORE: No state parameter
export const getDashboardSummary = async (clientId?: string) => {
  return await fetch('/api/admin/dashboard/summary?clientId=' + clientId);
};

export const getAvailableStates = async () => {
  // THIS DOESN'T EXIST - Need to add it
};
```

### Updated Code
```typescript
// AFTER: Add state parameter support
export const getDashboardSummary = async (
  clientId?: string,
  stateCode?: string
) => {
  const params = new URLSearchParams();
  if (clientId) params.append('clientId', clientId);
  if (stateCode) params.append('stateCode', stateCode);

  return await fetch(`/api/admin/dashboard/summary?${params}`);
};

// NEW: Fetch available states
export const getAvailableStates = async () => {
  const response = await fetch('/api/admin/dashboard/states');
  return response.json();
};

// OPTIONAL: Add for other endpoints
export const getDashboardEscalations = async (
  clientId?: string,
  stateCode?: string
) => {
  const params = new URLSearchParams();
  if (clientId) params.append('clientId', clientId);
  if (stateCode) params.append('stateCode', stateCode);

  return await fetch(`/api/admin/dashboard/escalations?${params}`);
};
```

---

## Step 3: Update Dashboard Component

**File:** `AdminDashboard.tsx` or `AdminDashboard.vue`

### Update State Management

```typescript
// Add these state variables
const [states, setStates] = useState<string[]>([]);
const [selectedState, setSelectedState] = useState<string>('');
const [selectedClient, setSelectedClient] = useState<string>('');
const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
const [loading, setLoading] = useState(false);
```

### Load States on Mount

```typescript
// React useEffect
useEffect(() => {
  const fetchStates = async () => {
    try {
      const availableStates = await getAvailableStates();
      setStates(availableStates || []);
    } catch (error) {
      console.error('Error loading states:', error);
      setStates([]);
    }
  };

  fetchStates();
}, []);

// Vue mounted
mounted() {
  this.loadStates();
}

async loadStates() {
  try {
    this.states = await getAvailableStates() || [];
  } catch (error) {
    console.error('Error loading states:', error);
    this.states = [];
  }
}
```

### Load Dashboard Data

```typescript
// React version
const loadDashboard = async () => {
  setLoading(true);
  try {
    const response = await getDashboardSummary(
      selectedClient || undefined,
      selectedState || undefined
    );
    const data = await response.json();
    setDashboardData(data);
  } catch (error) {
    console.error('Error loading dashboard:', error);
  } finally {
    setLoading(false);
  }
};

// Call on mount and when filters change
useEffect(() => {
  loadDashboard();
}, [selectedClient, selectedState]);

// Vue version
async loadDashboard() {
  this.loading = true;
  try {
    const response = await getDashboardSummary(
      this.selectedClient || undefined,
      this.selectedState || undefined
    );
    this.dashboardData = await response.json();
  } catch (error) {
    console.error('Error loading dashboard:', error);
  } finally {
    this.loading = false;
  }
}

// Watchers
watch: {
  selectedClient() { this.loadDashboard(); },
  selectedState() { this.loadDashboard(); }
}
```

### Handle State Selection

```typescript
// React
const handleStateChange = (state: string) => {
  setSelectedState(state);
  // loadDashboard() is called by useEffect
};

const handleClientChange = (clientId: string) => {
  setSelectedClient(clientId);
  // loadDashboard() is called by useEffect
};

// Vue
handleStateChange(state: string) {
  this.selectedState = state;
  // loadDashboard() is called by watcher
}

handleClientChange(clientId: string) {
  this.selectedClient = clientId;
  // loadDashboard() is called by watcher
}
```

---

## Step 4: Update HTML/JSX

### State Dropdown

```jsx
{/* React JSX */}
<select
  value={selectedState}
  onChange={(e) => handleStateChange(e.target.value)}
  className="state-selector"
  disabled={states.length === 0}
>
  <option value="">All States</option>
  {states.map((state) => (
    <option key={state} value={state}>
      {state}
    </option>
  ))}
</select>

{/* Vue */}
<select
  v-model="selectedState"
  class="state-selector"
  :disabled="states.length === 0"
>
  <option value="">All States</option>
  <option v-for="state in states" :key="state" :value="state">
    {{ state }}
  </option>
</select>
```

### Client Dropdown (if exists)

```jsx
{/* React */}
<select
  value={selectedClient}
  onChange={(e) => handleClientChange(e.target.value)}
  className="client-selector"
>
  <option value="">All Clients</option>
  {clients.map((client) => (
    <option key={client.id} value={client.id}>
      {client.name}
    </option>
  ))}
</select>

{/* Vue */}
<select
  v-model="selectedClient"
  class="client-selector"
>
  <option value="">All Clients</option>
  <option v-for="client in clients" :key="client.id" :value="client.id">
    {{ client.name }}
  </option>
</select>
```

### Display Dashboard Data

```jsx
{/* React */}
{loading && <p>Loading...</p>}
{dashboardData && !loading && (
  <div className="dashboard-grid">
    <div className="dashboard-card">
      <h3>Clients</h3>
      <p className="metric">{dashboardData.clientsCount}</p>
    </div>
    <div className="dashboard-card">
      <h3>Branches</h3>
      <p className="metric">{dashboardData.branchesCount}</p>
    </div>
    <div className="dashboard-card">
      <h3>SLA Score</h3>
      <p className="metric">{dashboardData.slaScorePct}%</p>
      <span className={`badge ${dashboardData.slaStatus.toLowerCase()}`}>
        {dashboardData.slaStatus}
      </span>
    </div>
    {/* Other metrics */}
  </div>
)}
```

---

## Step 5: Error Handling

Add error handling for API failures:

```typescript
// React
const [error, setError] = useState<string | null>(null);

const loadDashboard = async () => {
  setLoading(true);
  setError(null);
  try {
    const response = await getDashboardSummary(
      selectedClient || undefined,
      selectedState || undefined
    );
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    const data = await response.json();
    setDashboardData(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error loading dashboard:', message);
    setError(message);
  } finally {
    setLoading(false);
  }
};

// In JSX
{error && <div className="error-banner">{error}</div>}
```

---

## Step 6: Optional - Add Loading States

```typescript
// Disable dropdowns while loading
<select
  value={selectedState}
  onChange={(e) => handleStateChange(e.target.value)}
  disabled={loading || states.length === 0}
>
  {/* ... */}
</select>
```

---

## Testing Checklist

After implementation, test:

- [ ] States dropdown loads on page load
- [ ] States dropdown is not empty (shows all available states)
- [ ] Selecting a state filters the dashboard
- [ ] Clearing state selection shows all data
- [ ] Dashboard metrics update when state changes
- [ ] Loading indicator shows while fetching
- [ ] Error message displays if API fails
- [ ] No console errors
- [ ] Network tab shows correct API calls with stateCode parameter

---

## Example Test Cases

### Test 1: States Load
```
1. Open admin dashboard
2. Wait for page to load
3. Click state dropdown
4. Verify: Dropdown shows states (e.g., CA, NY, TX)
5. Verify: Not empty
```

### Test 2: State Filtering Works
```
1. Open admin dashboard
2. Select state "CA"
3. Verify: Dashboard data updates
4. Verify: Branches count changes
5. Verify: Data is only for CA
```

### Test 3: Clear Filter
```
1. Select state "CA"
2. Click dropdown, select "All States"
3. Verify: Dashboard shows all data again
4. Verify: Metrics increase
```

### Test 4: Combined Filters
```
1. Select client "ABC Corp"
2. Select state "CA"
3. Verify: Shows CA branches for ABC Corp only
4. Change state to "NY"
5. Verify: Shows NY branches for ABC Corp only
```

---

## Common Issues & Solutions

### Issue: States dropdown is empty
**Solution:**
```bash
# Check backend endpoint
curl http://localhost:3000/api/admin/dashboard/states

# If empty, database might not have state data
# See database verification section
```

### Issue: State selection doesn't filter
**Solution:**
1. Check network tab to verify API call includes `stateCode` parameter
2. Verify `selectedState` is being passed to `getDashboardSummary()`
3. Check backend logs for errors

### Issue: Dashboard data doesn't update
**Solution:**
1. Verify `useEffect` or watcher is set up to call `loadDashboard()` when state changes
2. Check browser console for JavaScript errors
3. Verify API response includes filtered data

### Issue: Dropdown shows "[object Object]"
**Solution:**
```typescript
// Make sure getAvailableStates returns array of strings
return states.map((s: any) => s.state_code); // ← Correct
return states; // ← Wrong, returns objects
```

---

## Performance Considerations

### Cache States (Optional)
```typescript
// Cache states to avoid repeated API calls
const [states, setStates] = useState<string[]>([]);
const [statesCached, setStatesCached] = useState(false);

useEffect(() => {
  if (!statesCached) {
    fetchStates();
    setStatesCached(true);
  }
}, [statesCached]);
```

### Debounce Filters (Optional)
```typescript
// Avoid excessive API calls while typing
import { useEffect, useState } from 'react';

const [selectedState, setSelectedState] = useState('');
const [debouncedState, setDebouncedState] = useState('');

useEffect(() => {
  const timer = setTimeout(() => {
    setDebouncedState(selectedState);
  }, 300);

  return () => clearTimeout(timer);
}, [selectedState]);

useEffect(() => {
  loadDashboard();
}, [debouncedState]); // Load when debounced value changes
```

---

## Summary

**What Frontend Needs:**
1. ✅ Fetch states from `/api/admin/dashboard/states`
2. ✅ Pass `stateCode` parameter to dashboard API
3. ✅ Update dashboard when state changes
4. ✅ Display state dropdown with dynamic values

**Timeline:** 30 minutes
**Difficulty:** EASY
**Files to Update:** 2-3 (service file + component file)

---

## Next Steps

1. Locate your frontend files
2. Identify dashboard component and service
3. Apply the changes above
4. Test locally
5. Commit and deploy

---

**Backend Status:** ✅ COMPLETE
**Frontend Status:** 🔄 IN PROGRESS
**Testing Status:** ⏳ PENDING
