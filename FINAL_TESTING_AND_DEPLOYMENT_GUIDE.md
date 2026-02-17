# Final Testing & Deployment Guide

**Date:** 2026-02-12
**Status:** Implementation Complete - Ready for Testing & Deployment
**Estimated Time:** 1-2 hours total

---

## 🎯 Overview

All code implementation is complete and builds successfully. This guide walks you through:
1. Testing the backend API endpoints
2. Testing the frontend UI
3. Deploying to production

---

## 📋 STEP 1: Start the Backend Server

### Prerequisites
- Node.js installed
- PostgreSQL database running and accessible
- Environment variables configured (.env file)

### Start Backend
```bash
cd backend
npm start
```

**Expected Output:**
```
[NestJS] 12/02/2026, 10:30:45 AM     LOG [NestFactory] Starting Nest application...
[NestJS] 12/02/2026, 10:30:46 AM     LOG [InstanceLoader] TypeOrmModule dependencies initialized
...
[NestJS] 12/02/2026, 10:30:50 AM     LOG [NestApplication] Nest application successfully started
[NestJS] 12/02/2026, 10:30:50 AM     LOG Listening on port 3000 🚀
```

**Wait for:** "Listening on port 3000" message

---

## 🧪 STEP 2: Test Backend API Endpoints

Once backend is running, test these endpoints:

### Test 2.1: Get Available States
```bash
curl "http://localhost:3000/api/admin/dashboard/states"
```

**Expected Response:**
```json
["CA", "NY", "TX", "FL", ...]
```

**What it tests:**
- ✅ Backend is running
- ✅ States endpoint works
- ✅ Database has state data

**Troubleshooting:**
- If empty array: Need to populate state data in database
- If 404: Check if backend is running (see Step 1)
- If 500: Check backend logs for errors

---

### Test 2.2: Get Dashboard Summary (All Data)
```bash
curl "http://localhost:3000/api/admin/dashboard/summary"
```

**Expected Response:**
```json
{
  "clientsCount": 25,
  "branchesCount": 150,
  "slaScorePct": 95,
  "slaStatus": "GREEN",
  "overdueAuditsCount": 2,
  "dueSoonAuditsCount": 8,
  "unreadNotificationsCount": 12
}
```

**What it tests:**
- ✅ Summary endpoint works without filter
- ✅ Returns all data

---

### Test 2.3: Get Dashboard Summary with State Filter
```bash
curl "http://localhost:3000/api/admin/dashboard/summary?stateCode=CA"
```

**Expected Response:**
```json
{
  "clientsCount": 5,
  "branchesCount": 20,
  "slaScorePct": 98,
  "slaStatus": "GREEN",
  "overdueAuditsCount": 0,
  "dueSoonAuditsCount": 2,
  "unreadNotificationsCount": 3
}
```

**What it tests:**
- ✅ Summary endpoint accepts stateCode parameter
- ✅ Filters data by state (numbers should be lower than Test 2.2)
- ✅ SQL query filtering works

---

### Test 2.4: Get Escalations
```bash
curl "http://localhost:3000/api/admin/dashboard/escalations"
```

**Expected Response:**
```json
[
  {
    "clientName": "ABC Corp",
    "issueType": "AUDIT",
    "reason": "OVERDUE",
    "daysDelayed": 5
  },
  ...
]
```

---

### Test 2.5: Get Escalations with State Filter
```bash
curl "http://localhost:3000/api/admin/dashboard/escalations?stateCode=CA"
```

**Expected Response:**
Array of escalations filtered to CA only (should have fewer items than Test 2.4)

---

## ✅ API Testing Checklist

- [ ] Test 2.1: States endpoint returns array (not empty)
- [ ] Test 2.2: Summary endpoint returns dashboard data
- [ ] Test 2.3: Summary with stateCode filter works
- [ ] Test 2.4: Escalations endpoint works
- [ ] Test 2.5: Escalations with stateCode filter works
- [ ] Response times are reasonable (< 1 second)
- [ ] No 5xx errors in responses
- [ ] State codes in responses match database

---

## 🌐 STEP 3: Test Frontend UI

### Prerequisites
- Backend running and tested (Step 1-2)
- Frontend built: `npm run build` (already done)

### Start Frontend Dev Server (Optional)
If you want to test with hot reload:
```bash
cd frontend
npm start
# Opens at http://localhost:4200
```

Or open built version:
```bash
# Use the dist/ folder files
# Serve with: npx http-server frontend/dist/statco-frontend
```

---

## 🎨 Frontend Testing Procedure

### Test 3.1: Load Admin Dashboard
1. Open browser
2. Navigate to admin dashboard (`http://localhost:4200/admin/dashboard` or similar)
3. Wait for page to fully load

**What to verify:**
- ✅ Page loads without errors
- ✅ Dashboard metrics visible
- ✅ No red error messages

---

### Test 3.2: Verify States Dropdown
1. Look at "System Filters" section
2. Find "State" dropdown
3. Click dropdown to open

**What to verify:**
- ✅ Dropdown shows multiple state options
- ✅ NOT hardcoded to "All States" only
- ✅ Shows actual state codes (CA, NY, TX, etc.)
- ✅ "All States" is the first option

**Expected states:** CA, NY, TX, FL, etc.

---

### Test 3.3: Test State Selection
1. Select "CA" from state dropdown
2. Observe dashboard metrics

**What to verify:**
- ✅ Dropdown value changes to "CA"
- ✅ Dashboard metrics update
- ✅ Metrics are different from Test 3.2 (should be lower)
- ✅ Update happens immediately or quickly

---

### Test 3.4: Test Multiple State Changes
1. Select "NY"
2. Verify metrics change
3. Select "TX"
4. Verify metrics change again
5. Select "All States"
6. Verify metrics increase back to original values

**What to verify:**
- ✅ Each state selection filters data correctly
- ✅ "All States" shows complete data
- ✅ UI is responsive
- ✅ No lag or delays

---

### Test 3.5: Verify Network Requests
1. Open browser DevTools (F12)
2. Go to Network tab
3. Select a state from dropdown
4. Click "Apply" button (if present)
5. Look at network requests

**Expected request:**
```
GET /api/admin/dashboard/summary?stateCode=CA
```

**What to verify:**
- ✅ Request includes `stateCode` parameter
- ✅ Parameter value matches selected state
- ✅ Response is 200 (not 404 or 500)
- ✅ Response includes filtered data

---

### Test 3.6: Check Browser Console
1. DevTools still open
2. Click "Console" tab
3. Look for any red errors

**What to verify:**
- ✅ No red error messages
- ✅ No 404 errors for API calls
- ✅ No TypeScript compilation errors
- ✅ Console is clean (warnings are OK)

---

## ✅ Frontend Testing Checklist

- [ ] Dashboard loads without errors
- [ ] States dropdown shows multiple state codes
- [ ] States dropdown is NOT empty
- [ ] Selecting state filters dashboard
- [ ] Metrics change when state changes
- [ ] "All States" shows complete data
- [ ] Network requests include stateCode parameter
- [ ] No console errors
- [ ] UI is responsive
- [ ] Loading states work (if visible)

---

## 📊 Database State Data Verification

If states aren't showing in frontend, verify database has state data:

### Quick Check
```sql
-- Check if states exist
SELECT DISTINCT state_code
FROM client_branches
WHERE state_code IS NOT NULL
  AND isactive = TRUE
  AND isdeleted = FALSE
ORDER BY state_code;
```

**Expected:** Non-empty list of state codes

### If Empty, Populate Test Data
```sql
-- Add test states
UPDATE client_branches
SET state_code = 'CA'
WHERE state_code IS NULL
  AND isactive = TRUE
  AND isdeleted = FALSE
LIMIT 50;

UPDATE client_branches
SET state_code = 'NY'
WHERE state_code IS NULL
  AND isactive = TRUE
  AND isdeleted = FALSE
LIMIT 50;

UPDATE client_branches
SET state_code = 'TX'
WHERE state_code IS NULL
  AND isactive = TRUE
  AND isdeleted = FALSE
LIMIT 50;

-- Verify
SELECT DISTINCT state_code FROM client_branches ORDER BY state_code;
```

---

## 🚀 STEP 4: Deployment to Production

### Prerequisites
- ✅ All API tests pass (Step 2)
- ✅ All frontend tests pass (Step 3)
- ✅ No errors in logs
- ✅ Database has state data

### 4.1: Build Backend
```bash
cd backend
npm run build
```

**Expected:**
```
[NestJS] Compiling application - 0/1
[NestJS] Compiling application - 1/1
Successfully compiled: 143 files ✅
```

---

### 4.2: Build Frontend
```bash
cd frontend
npm run build
```

**Expected:**
```
✔ Building...
Initial chunk files | Names | Raw size
chunk-U73ZQP63.js | - | 293.68 kB
main-SI2KDQOQ.js | main | 113.17 kB
...
Output location: dist/statco-frontend
```

---

### 4.3: Deploy Backend
Copy built backend to production:
```bash
# Backend dist is in: backend/dist/
# Copy to your production server
# Restart backend service
```

---

### 4.4: Deploy Frontend
Copy built frontend to production:
```bash
# Frontend dist is in: frontend/dist/statco-frontend/
# Copy to your web server
# Update web server configuration if needed
```

---

### 4.5: Verify in Production
Once deployed:

1. **Test API in production:**
```bash
curl "https://your-domain.com/api/admin/dashboard/states"
```

2. **Test UI in production:**
- Open https://your-domain.com/admin/dashboard
- Verify states dropdown shows options
- Select a state and verify filtering works

3. **Monitor logs:**
- Check backend logs for errors
- Check frontend console (DevTools)
- Look for any 5xx errors

---

## ✅ Post-Deployment Checklist

- [ ] Backend builds successfully
- [ ] Frontend builds successfully
- [ ] Backend deployed to production
- [ ] Frontend deployed to production
- [ ] API endpoints responding correctly
- [ ] States endpoint returns data
- [ ] Dashboard loads without errors
- [ ] State filtering works in production
- [ ] No console errors
- [ ] No 5xx errors in logs
- [ ] Performance is acceptable
- [ ] Users can access dashboard

---

## 🐛 Troubleshooting

### Issue: States dropdown is empty
**Solution:**
1. Check database: Run state verification query
2. If empty, populate test data (see Database Verification section)
3. Restart backend
4. Refresh frontend

### Issue: State selection doesn't filter
**Solution:**
1. Check browser DevTools Network tab
2. Verify request includes `?stateCode=CA`
3. Check backend logs for errors
4. Verify `stateCode` parameter is being passed

### Issue: API returns 404
**Solution:**
1. Verify backend is running
2. Check port is 3000
3. Check API endpoint path is correct
4. Verify backend is fully started

### Issue: Frontend build fails
**Solution:**
1. Check Node.js version is compatible
2. Run `npm clean-install` in frontend directory
3. Check for TypeScript errors: `npm run build`
4. Review error message carefully

---

## 📈 Performance Expectations

| Operation | Expected Time |
|-----------|---------------|
| States endpoint | < 100ms |
| Summary endpoint | < 500ms |
| State dropdown load | < 1 second |
| State selection filter | < 1 second |
| Page load | < 3 seconds |

If significantly slower, check:
- Database query performance
- Network latency
- Server resources (CPU, memory)

---

## 🎯 Success Criteria

**Backend:**
- ✅ All API endpoints respond correctly
- ✅ State filtering works
- ✅ Error handling works
- ✅ Build passes

**Frontend:**
- ✅ States dropdown populated
- ✅ State selection filters data
- ✅ No console errors
- ✅ Build passes

**Database:**
- ✅ State data exists
- ✅ Multiple states available
- ✅ Data is consistent

**Deployment:**
- ✅ All tests pass in staging
- ✅ All tests pass in production
- ✅ Users report working state filter

---

## 📞 Support

### Common Questions

**Q: How do I know if tests passed?**
A: All expected responses should match the examples in this guide. If they differ, check the troubleshooting section.

**Q: Can I skip any tests?**
A: No. Each test verifies a critical piece. Skipping increases deployment risk.

**Q: How long does testing take?**
A: 30-45 minutes total if everything works smoothly.

**Q: What if a test fails?**
A: See troubleshooting section. Don't deploy until all tests pass.

---

## 🏁 Summary

This guide provides step-by-step instructions for:
1. Starting the backend
2. Testing all API endpoints
3. Testing the frontend UI
4. Deploying to production
5. Verifying in production

Follow each step in order. Don't skip any. Test thoroughly before deploying.

**Estimated Total Time:** 1-2 hours
**Recommended:** Test in staging first, then production

---

## Next Steps

1. **Now:** Read this entire guide
2. **Then:** Start backend server (Step 1)
3. **Then:** Run API tests (Step 2)
4. **Then:** Test frontend UI (Step 3)
5. **Then:** Deploy to production (Step 4)
6. **Finally:** Verify in production

**You're ready to deploy! 🚀**

