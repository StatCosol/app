-- ============================================================================
-- DATABASE DIAGNOSTIC AND CORRECTION SCRIPT
-- Admin Dashboard State Filter Implementation
-- Date: 2026-02-12
-- ============================================================================
--
-- This script will:
-- 1. Diagnose all potential issues in the database
-- 2. Identify data inconsistencies
-- 3. Provide corrective SQL statements
-- 4. Verify all corrections are applied
--
-- ============================================================================

-- ============================================================================
-- SECTION 1: SCHEMA VERIFICATION
-- ============================================================================

-- Check 1.1: Verify client_branches table exists and has correct structure
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'client_branches'
ORDER BY ordinal_position;

-- Expected: Should have columns: id, clientid, branchname, state_code, isactive, isdeleted, etc.

-- Check 1.2: Verify clients table exists and has correct structure
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'clients'
ORDER BY ordinal_position;

-- Expected: Should have columns: id, is_active, name, etc.

-- Check 1.3: Verify state_code column properties
SELECT
  column_name,
  data_type,
  character_maximum_length,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'client_branches'
  AND column_name ILIKE '%state%';

-- Expected: state_code VARCHAR(variable length), nullable=YES

-- ============================================================================
-- SECTION 2: DATA QUALITY CHECKS
-- ============================================================================

-- Check 2.1: Count total branches and those with state data
SELECT
  'Total branches' as check_name,
  COUNT(*) as count
FROM client_branches
UNION ALL
SELECT
  'Branches with state_code',
  COUNT(*)
FROM client_branches
WHERE state_code IS NOT NULL
UNION ALL
SELECT
  'Branches with NULL state_code',
  COUNT(*)
FROM client_branches
WHERE state_code IS NULL
UNION ALL
SELECT
  'Active branches with state',
  COUNT(*)
FROM client_branches
WHERE isactive = TRUE
  AND state_code IS NOT NULL
  AND isdeleted = FALSE;

-- Expected: Should show distribution of state data

-- Check 2.2: Get distinct state codes and their frequency
SELECT
  COALESCE(state_code, 'NULL') as state_code,
  COUNT(*) as branch_count,
  COUNT(DISTINCT clientid) as unique_clients,
  MIN(branchname) as sample_branch
FROM client_branches
GROUP BY state_code
ORDER BY branch_count DESC, state_code;

-- Expected: Should show multiple states with data

-- Check 2.3: Check for invalid state codes
SELECT
  DISTINCT state_code,
  LENGTH(state_code) as code_length
FROM client_branches
WHERE state_code IS NOT NULL
  AND (LENGTH(TRIM(state_code)) = 0
    OR LENGTH(state_code) > 2
    OR state_code ~ '[^A-Z]')
ORDER BY state_code;

-- Expected: Should be empty (no invalid codes)

-- Check 2.4: Verify client references (no orphaned branches)
SELECT
  COUNT(*) as orphaned_branches
FROM client_branches cb
WHERE NOT EXISTS (
  SELECT 1 FROM clients c WHERE c.id = cb.clientid
)
  AND cb.isactive = TRUE
  AND cb.isdeleted = FALSE;

-- Expected: Should be 0 (no orphaned branches)

-- Check 2.5: Check active/deleted flags consistency
SELECT
  isactive,
  isdeleted,
  COUNT(*) as count
FROM client_branches
GROUP BY isactive, isdeleted
ORDER BY isactive, isdeleted;

-- Expected: Should show valid combinations

-- ============================================================================
-- SECTION 3: API QUERY SIMULATION
-- ============================================================================

-- Check 3.1: Simulate GET /api/admin/dashboard/states
SELECT DISTINCT state_code
FROM client_branches
WHERE state_code IS NOT NULL
  AND isactive = TRUE
  AND isdeleted = FALSE
ORDER BY state_code ASC;

-- Expected: Returns array of state codes for dropdown

-- Check 3.2: Simulate GET /api/admin/dashboard/summary (no filter)
SELECT
  COUNT(DISTINCT c.id) as clients_count,
  COUNT(DISTINCT b.id) as branches_count
FROM clients c
LEFT JOIN client_branches b ON c.id = b.clientid
WHERE c.is_active = TRUE
  AND b.isactive = TRUE
  AND b.isdeleted = FALSE;

-- Expected: Should return non-zero counts

-- Check 3.3: Simulate GET /api/admin/dashboard/summary with state filter (CA)
SELECT
  COUNT(DISTINCT c.id) as clients_count,
  COUNT(DISTINCT b.id) as branches_count
FROM clients c
LEFT JOIN client_branches b ON c.id = b.clientid
WHERE c.is_active = TRUE
  AND b.isactive = TRUE
  AND b.isdeleted = FALSE
  AND b.state_code = 'CA';

-- Expected: Should return non-zero counts (if CA exists)

-- ============================================================================
-- SECTION 4: PERFORMANCE CHECKS
-- ============================================================================

-- Check 4.1: Verify indexes exist on frequently queried columns
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('client_branches', 'clients')
  AND (indexdef ILIKE '%state%'
    OR indexdef ILIKE '%clientid%'
    OR indexdef ILIKE '%is_active%')
ORDER BY tablename, indexname;

-- Expected: Should show indexes for performance

-- Check 4.2: Check execution time for state query (EXPLAIN ANALYZE)
EXPLAIN ANALYZE
SELECT DISTINCT state_code
FROM client_branches
WHERE state_code IS NOT NULL
  AND isactive = TRUE
  AND isdeleted = FALSE
ORDER BY state_code ASC;

-- Expected: Should complete in < 100ms

-- ============================================================================
-- SECTION 5: DATA COMPLETENESS CHECKS
-- ============================================================================

-- Check 5.1: Find branches without state codes that should have them
SELECT
  id,
  branchname,
  clientid,
  isactive,
  isdeleted
FROM client_branches
WHERE state_code IS NULL
  AND isactive = TRUE
  AND isdeleted = FALSE
LIMIT 20;

-- Expected: Should be empty or show branches that need state codes

-- Check 5.2: Verify all US states are representable (if applicable)
SELECT
  state_code,
  COUNT(*) as count
FROM client_branches
WHERE state_code IN (
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
)
GROUP BY state_code
ORDER BY state_code;

-- Expected: Should show which US states have data

-- ============================================================================
-- SECTION 6: CORRECTION PROCEDURES
-- ============================================================================
--
-- If checks identify issues, use the procedures below:
--

-- CORRECTION 6.1: If many branches have NULL state_code
-- Assign state codes based on branch location/region
-- (This is an example - adjust based on your data)
/*
UPDATE client_branches
SET state_code = 'CA'
WHERE state_code IS NULL
  AND isactive = TRUE
  AND isdeleted = FALSE
  AND branchname ILIKE '%california%';

UPDATE client_branches
SET state_code = 'NY'
WHERE state_code IS NULL
  AND isactive = TRUE
  AND isdeleted = FALSE
  AND branchname ILIKE '%new york%';

-- Continue for other states...
*/

-- CORRECTION 6.2: If state codes have invalid format
-- Standardize to uppercase 2-letter codes
/*
UPDATE client_branches
SET state_code = UPPER(TRIM(state_code))
WHERE state_code IS NOT NULL;
*/

-- CORRECTION 6.3: If there are orphaned branches
-- List them for manual review
/*
SELECT
  cb.id,
  cb.branchname,
  cb.clientid,
  'CLIENT NOT FOUND' as issue
FROM client_branches cb
WHERE NOT EXISTS (
  SELECT 1 FROM clients c WHERE c.id = cb.clientid
)
  AND cb.isactive = TRUE
  AND cb.isdeleted = FALSE;
*/

-- ============================================================================
-- SECTION 7: FINAL VERIFICATION
-- ============================================================================

-- Verification 7.1: Confirm state data is ready for API
SELECT
  COUNT(DISTINCT state_code) as unique_states,
  COUNT(*) as total_branches_with_state,
  MIN(state_code) as min_state,
  MAX(state_code) as max_state
FROM client_branches
WHERE state_code IS NOT NULL
  AND isactive = TRUE
  AND isdeleted = FALSE;

-- Expected: Should show multiple unique states, many branches with state codes

-- Verification 7.2: Confirm no data integrity issues
SELECT
  'Orphaned branches' as issue_type,
  COUNT(*) as count
FROM client_branches cb
WHERE NOT EXISTS (SELECT 1 FROM clients c WHERE c.id = cb.clientid)
  AND cb.isactive = TRUE
UNION ALL
SELECT
  'Branches with NULL state',
  COUNT(*)
FROM client_branches
WHERE state_code IS NULL
  AND isactive = TRUE
  AND isdeleted = FALSE
UNION ALL
SELECT
  'Invalid state codes',
  COUNT(*)
FROM client_branches
WHERE state_code IS NOT NULL
  AND (LENGTH(TRIM(state_code)) = 0 OR LENGTH(state_code) > 2)
UNION ALL
SELECT
  'Duplicate branches',
  COUNT(*) - COUNT(DISTINCT id)
FROM client_branches;

-- Expected: All counts should be 0 or acceptable

-- ============================================================================
-- SECTION 8: SUMMARY REPORT
-- ============================================================================

-- Summary: Database readiness for state filter feature
SELECT
  'Database Check' as check_category,
  'State codes available' as check_item,
  CASE
    WHEN COUNT(DISTINCT state_code) >= 3 THEN '✅ PASS'
    ELSE '❌ FAIL - Need to populate state codes'
  END as status,
  COUNT(DISTINCT state_code) as details
FROM client_branches
WHERE state_code IS NOT NULL
  AND isactive = TRUE
  AND isdeleted = FALSE
GROUP BY check_category, check_item

UNION ALL

SELECT
  'Database Check',
  'Branch data exists',
  CASE
    WHEN COUNT(*) > 100 THEN '✅ PASS'
    ELSE '⚠️  WARNING - Low data volume'
  END,
  COUNT(*)
FROM client_branches
WHERE isactive = TRUE
  AND isdeleted = FALSE

UNION ALL

SELECT
  'Database Check',
  'No orphaned branches',
  CASE
    WHEN COUNT(*) = 0 THEN '✅ PASS'
    ELSE '❌ FAIL - Orphaned branches found'
  END,
  COUNT(*)
FROM client_branches cb
WHERE NOT EXISTS (SELECT 1 FROM clients c WHERE c.id = cb.clientid)
  AND isactive = TRUE

UNION ALL

SELECT
  'Database Check',
  'No invalid state codes',
  CASE
    WHEN COUNT(*) = 0 THEN '✅ PASS'
    ELSE '❌ FAIL - Invalid state codes found'
  END,
  COUNT(*)
FROM client_branches
WHERE state_code IS NOT NULL
  AND (LENGTH(TRIM(state_code)) = 0 OR LENGTH(state_code) > 2)
  AND isactive = TRUE;

-- ============================================================================
-- END OF DIAGNOSTIC SCRIPT
-- ============================================================================
--
-- NEXT STEPS:
-- 1. Run all checks above to identify issues
-- 2. Review any failures
-- 3. Apply appropriate corrections
-- 4. Re-run verification checks
-- 5. Confirm all checks pass
-- 6. Database is ready for state filter feature
--
-- ============================================================================
