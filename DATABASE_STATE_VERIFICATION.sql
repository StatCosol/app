-- Database State Verification Queries
-- Use these to verify state data exists and is properly formatted
-- Date: 2026-02-12

-- ==============================================================
-- STEP 1: CHECK IF STATE DATA EXISTS
-- ==============================================================

-- Query 1a: Get all distinct states
SELECT DISTINCT state_code
FROM client_branches
WHERE state_code IS NOT NULL
  AND isactive = TRUE
  AND isdeleted = FALSE
ORDER BY state_code ASC;

-- Expected: Non-empty list of state codes (e.g., CA, NY, TX, ...)
-- If EMPTY: No state data exists, need to populate test data


-- ==============================================================
-- STEP 2: COUNT BRANCHES PER STATE
-- ==============================================================

-- Query 2a: Count branches per state
SELECT
  state_code,
  COUNT(*) as branch_count,
  COUNT(DISTINCT clientid) as client_count
FROM client_branches
WHERE state_code IS NOT NULL
  AND isactive = TRUE
  AND isdeleted = FALSE
GROUP BY state_code
ORDER BY branch_count DESC;

-- Expected: Multiple rows with state codes and counts
-- This shows which states have how many branches


-- ==============================================================
-- STEP 3: VERIFY COLUMN STRUCTURE
-- ==============================================================

-- Query 3a: Check state column exists and its properties
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'client_branches'
  AND column_name LIKE '%state%'
ORDER BY column_name;

-- Expected: Column 'state_code' as VARCHAR, nullable


-- ==============================================================
-- STEP 4: VERIFY SQL QUERY LOGIC
-- ==============================================================

-- Query 4a: Test the SQL query logic (without parameter)
WITH filtered_clients AS (
  SELECT c.id
  FROM clients c
  WHERE c.is_active = TRUE
),
filtered_branches AS (
  SELECT b.id, b.clientid
  FROM client_branches b
  JOIN filtered_clients fc ON fc.id = b.clientid
  WHERE b.isactive = TRUE
)
SELECT
  (SELECT COUNT(*) FROM filtered_clients) AS clients_count,
  (SELECT COUNT(*) FROM filtered_branches) AS branches_count;

-- Expected: Numbers greater than 0


-- ==============================================================
-- STEP 5: TEST STATE FILTERING LOGIC
-- ==============================================================

-- Query 5a: Test filtering by specific state (e.g., CA)
WITH filtered_clients AS (
  SELECT c.id
  FROM clients c
  WHERE c.is_active = TRUE
    AND 'CA' IS NULL OR c.state = 'CA'  -- State filter
),
filtered_branches AS (
  SELECT b.id, b.clientid
  FROM client_branches b
  JOIN filtered_clients fc ON fc.id = b.clientid
  WHERE b.isactive = TRUE
)
SELECT
  (SELECT COUNT(*) FROM filtered_clients) AS clients_count,
  (SELECT COUNT(*) FROM filtered_branches) AS branches_count;

-- Expected: Lower counts than without filter (if CA has data)


-- ==============================================================
-- STEP 6: POPULATE TEST DATA (IF NEEDED)
-- ==============================================================

-- Query 6a: Check if any branches have NULL state_code
SELECT COUNT(*) as null_states
FROM client_branches
WHERE state_code IS NULL
  AND isactive = TRUE
  AND isdeleted = FALSE;

-- Expected: Tells you how many branches lack state codes


-- Query 6b: Add test state codes (ONLY IF NEEDED)
-- WARNING: Only run if no state data exists
-- This adds test data for testing purposes

-- Option 1: Set first 5 branches to CA
UPDATE client_branches
SET state_code = 'CA'
WHERE state_code IS NULL
  AND isactive = TRUE
  AND isdeleted = FALSE
LIMIT 5;

-- Option 2: Set next 5 branches to NY
UPDATE client_branches
SET state_code = 'NY'
WHERE state_code IS NULL
  AND isactive = TRUE
  AND isdeleted = FALSE
LIMIT 5;

-- Option 3: Set next 5 branches to TX
UPDATE client_branches
SET state_code = 'TX'
WHERE state_code IS NULL
  AND isactive = TRUE
  AND isdeleted = FALSE
LIMIT 5;


-- ==============================================================
-- STEP 7: FINAL VERIFICATION
-- ==============================================================

-- Query 7a: Get comprehensive state overview
SELECT
  state_code,
  COUNT(DISTINCT id) as total_branches,
  COUNT(DISTINCT CASE WHEN isactive = TRUE THEN id END) as active_branches,
  COUNT(DISTINCT CASE WHEN isdeleted = FALSE THEN id END) as not_deleted_branches,
  COUNT(DISTINCT clientid) as unique_clients
FROM client_branches
GROUP BY state_code
ORDER BY total_branches DESC;

-- Expected: Shows state distribution of all branches


-- Query 7b: Test new API endpoint response (simulated)
SELECT DISTINCT state_code
FROM client_branches
WHERE state_code IS NOT NULL
  AND isactive = TRUE
  AND isdeleted = FALSE
ORDER BY state_code ASC;

-- Expected: This is what the API endpoint will return


-- ==============================================================
-- STEP 8: CHECK FOR ISSUES
-- ==============================================================

-- Query 8a: Find branches with invalid state codes
SELECT
  id,
  branchname,
  state_code,
  isactive,
  isdeleted
FROM client_branches
WHERE state_code IS NOT NULL
  AND LENGTH(TRIM(state_code)) = 0
LIMIT 10;

-- Expected: Should be empty (no blank state codes)


-- Query 8b: Find orphaned branches (no client)
SELECT
  COUNT(*) as orphaned_branches
FROM client_branches cb
WHERE NOT EXISTS (
  SELECT 1 FROM clients c WHERE c.id = cb.clientid
)
  AND isactive = TRUE
  AND isdeleted = FALSE;

-- Expected: Should be 0


-- ==============================================================
-- STEP 9: PERFORMANCE CHECK
-- ==============================================================

-- Query 9a: Check if state_code column is indexed
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'client_branches'
  AND indexdef ILIKE '%state%';

-- Expected: May show indexes on state_code (good for performance)


-- Query 9b: Quick state count query (what API endpoint will run)
EXPLAIN ANALYZE
SELECT DISTINCT state_code
FROM client_branches
WHERE state_code IS NOT NULL
  AND isactive = TRUE
  AND isdeleted = FALSE
ORDER BY state_code ASC;

-- Expected: Should complete quickly (< 1 second)


-- ==============================================================
-- STEP 10: CLEAN UP (IF TEST DATA ADDED)
-- ==============================================================

-- Query 10a: Verify your changes
SELECT
  state_code,
  COUNT(*) as count
FROM client_branches
WHERE state_code IS NOT NULL
GROUP BY state_code
ORDER BY state_code;

-- Only run ROLLBACK if you made changes you want to undo
-- ROLLBACK;

-- Commit changes
-- COMMIT;


-- ==============================================================
-- SUMMARY
-- ==============================================================

-- Run these in order:
-- 1. Query 1a - Check if states exist
-- 2. Query 2a - Count branches per state
-- 3. Query 3a - Verify column structure
-- 4. Query 4a - Test base query
-- 5. Query 5a - Test with state filter
-- If needed: Query 6b - Add test data
-- 6. Query 7a - Final verification
-- 7. Query 8a, 8b - Check for issues
-- 8. Query 9b - Performance test

-- If state_code is not populated:
-- - Run queries 6a, 6b to add test data
-- - Verify with query 7a
-- - Frontend will then show states in dropdown

-- All should complete successfully before frontend goes live
