-- ============================================================================
-- DATABASE MISSING DATA INVESTIGATION
-- Issue: Total clients not loaded, total branches not loaded, contractors not found
-- Date: 2026-02-12
-- ============================================================================

-- ============================================================================
-- SECTION 1: INVESTIGATE CLIENTS TABLE
-- ============================================================================

-- Check 1.1: Does clients table exist?
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'clients'
  ) as clients_table_exists;

-- Check 1.2: List all columns in clients table
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'clients'
ORDER BY ordinal_position;

-- Check 1.3: Count total clients
SELECT COUNT(*) as total_clients FROM clients;

-- Check 1.4: Count active clients (is_active = TRUE)
SELECT COUNT(*) as active_clients
FROM clients
WHERE is_active = TRUE;

-- Check 1.5: Count clients by active status
SELECT
  is_active,
  COUNT(*) as count
FROM clients
GROUP BY is_active;

-- Check 1.6: Sample client records
SELECT
  id,
  name,
  is_active,
  CASE WHEN is_active IS NULL THEN 'NULL' ELSE is_active::text END as active_status
FROM clients
LIMIT 10;

-- Check 1.7: Verify clients data exists
SELECT
  'Total clients' as metric,
  COUNT(*) as count,
  CASE WHEN COUNT(*) > 0 THEN '✅ Data exists' ELSE '❌ No data' END as status
FROM clients
UNION ALL
SELECT
  'Active clients',
  COUNT(*),
  CASE WHEN COUNT(*) > 0 THEN '✅ Data exists' ELSE '❌ No data' END
FROM clients
WHERE is_active = TRUE;

-- ============================================================================
-- SECTION 2: INVESTIGATE CLIENT_BRANCHES TABLE
-- ============================================================================

-- Check 2.1: Does client_branches table exist?
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'client_branches'
  ) as branches_table_exists;

-- Check 2.2: List all columns in client_branches table
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'client_branches'
ORDER BY ordinal_position;

-- Check 2.3: Count total branches
SELECT COUNT(*) as total_branches FROM client_branches;

-- Check 2.4: Count active branches
SELECT COUNT(*) as active_branches
FROM client_branches
WHERE isactive = TRUE
AND isdeleted = FALSE;

-- Check 2.5: Count branches by status
SELECT
  isactive,
  isdeleted,
  COUNT(*) as count
FROM client_branches
GROUP BY isactive, isdeleted
ORDER BY isactive DESC, isdeleted;

-- Check 2.6: Sample branch records
SELECT
  id,
  branchname,
  clientid,
  state_code,
  isactive,
  isdeleted
FROM client_branches
LIMIT 10;

-- Check 2.7: Verify branches data exists
SELECT
  'Total branches' as metric,
  COUNT(*) as count,
  CASE WHEN COUNT(*) > 0 THEN '✅ Data exists' ELSE '❌ No data' END as status
FROM client_branches
UNION ALL
SELECT
  'Active branches',
  COUNT(*),
  CASE WHEN COUNT(*) > 0 THEN '✅ Data exists' ELSE '❌ No data' END
FROM client_branches
WHERE isactive = TRUE
AND isdeleted = FALSE;

-- ============================================================================
-- SECTION 3: INVESTIGATE CONTRACTORS TABLE
-- ============================================================================

-- Check 3.1: List all tables in database (to find contractors table)
SELECT
  table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Check 3.2: Does contractors table exist?
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'contractors'
  ) as contractors_table_exists;

-- Check 3.3: Check for contractor-related tables
SELECT
  table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name ILIKE '%contractor%'
ORDER BY table_name;

-- Check 3.4: If contractors table exists, list columns
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'contractors'
ORDER BY ordinal_position;

-- Check 3.5: Count contractors (if table exists)
SELECT COUNT(*) as total_contractors FROM contractors;

-- Check 3.6: Count active contractors
SELECT COUNT(*) as active_contractors
FROM contractors
WHERE is_active = TRUE;

-- ============================================================================
-- SECTION 4: INVESTIGATE CLIENT-BRANCH RELATIONSHIPS
-- ============================================================================

-- Check 4.1: Count client-branch relationships
SELECT
  COUNT(DISTINCT c.id) as unique_clients_with_branches,
  COUNT(DISTINCT b.id) as total_branches,
  COUNT(*) as total_relationships
FROM clients c
LEFT JOIN client_branches b ON c.id = b.clientid
WHERE c.is_active = TRUE;

-- Check 4.2: Find clients without branches
SELECT
  COUNT(*) as clients_without_branches
FROM clients c
WHERE c.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM client_branches b
    WHERE b.clientid = c.id
  );

-- Check 4.3: Find branches without clients (orphaned)
SELECT
  COUNT(*) as orphaned_branches
FROM client_branches b
WHERE NOT EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = b.clientid
  )
  AND b.isactive = TRUE;

-- ============================================================================
-- SECTION 5: CHECK ADMIN DASHBOARD QUERIES
-- ============================================================================

-- Check 5.1: Simulate the exact dashboard summary query
SELECT
  COUNT(DISTINCT c.id) as clients_count,
  COUNT(DISTINCT b.id) as branches_count,
  COUNT(DISTINCT CASE WHEN b.state_code IS NOT NULL THEN b.state_code END) as states_with_data
FROM clients c
LEFT JOIN client_branches b ON c.id = b.clientid
WHERE c.is_active = TRUE
  AND b.isactive = TRUE
  AND b.isdeleted = FALSE;

-- Check 5.2: Check dashboard summary with detailed breakdown
SELECT
  'Clients' as metric,
  COUNT(DISTINCT c.id) as count
FROM clients c
WHERE c.is_active = TRUE
UNION ALL
SELECT
  'Active Branches',
  COUNT(*)
FROM client_branches
WHERE isactive = TRUE
  AND isdeleted = FALSE
UNION ALL
SELECT
  'Available States',
  COUNT(DISTINCT state_code)
FROM client_branches
WHERE state_code IS NOT NULL
  AND isactive = TRUE
  AND isdeleted = FALSE
UNION ALL
SELECT
  'Client-Branch Pairs',
  COUNT(DISTINCT c.id)
FROM clients c
INNER JOIN client_branches b ON c.id = b.clientid
WHERE c.is_active = TRUE
  AND b.isactive = TRUE
  AND b.isdeleted = FALSE;

-- ============================================================================
-- SECTION 6: CHECK DATA NULLABILITY ISSUES
-- ============================================================================

-- Check 6.1: Clients with NULL is_active
SELECT
  COUNT(*) as clients_with_null_active
FROM clients
WHERE is_active IS NULL;

-- Check 6.2: Branches with NULL isactive
SELECT
  COUNT(*) as branches_with_null_active
FROM client_branches
WHERE isactive IS NULL;

-- Check 6.3: Branches with NULL isdeleted
SELECT
  COUNT(*) as branches_with_null_deleted
FROM client_branches
WHERE isdeleted IS NULL;

-- Check 6.4: Branches with NULL clientid
SELECT
  COUNT(*) as branches_with_null_clientid
FROM client_branches
WHERE clientid IS NULL;

-- ============================================================================
-- SECTION 7: COMPREHENSIVE DIAGNOSTICS REPORT
-- ============================================================================

-- Report: Complete data inventory
SELECT
  'Clients Table' as item,
  'Total Records' as check_type,
  COUNT(*)::text as result,
  CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '❌' END as status
FROM clients
UNION ALL
SELECT
  'Clients Table',
  'Active Records (is_active = TRUE)',
  COUNT(*)::text,
  CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '❌' END
FROM clients
WHERE is_active = TRUE
UNION ALL
SELECT
  'Branches Table',
  'Total Records',
  COUNT(*)::text,
  CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '❌' END
FROM client_branches
UNION ALL
SELECT
  'Branches Table',
  'Active Records (isactive=T, isdeleted=F)',
  COUNT(*)::text,
  CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '❌' END
FROM client_branches
WHERE isactive = TRUE
  AND isdeleted = FALSE
UNION ALL
SELECT
  'States Data',
  'Unique State Codes',
  COUNT(DISTINCT state_code)::text,
  CASE WHEN COUNT(DISTINCT state_code) > 0 THEN '✅' ELSE '❌' END
FROM client_branches
WHERE state_code IS NOT NULL
  AND isactive = TRUE
  AND isdeleted = FALSE
UNION ALL
SELECT
  'Relationships',
  'Client-Branch Pairs',
  COUNT(DISTINCT c.id)::text,
  CASE WHEN COUNT(DISTINCT c.id) > 0 THEN '✅' ELSE '❌' END
FROM clients c
INNER JOIN client_branches b ON c.id = b.clientid
WHERE c.is_active = TRUE
  AND b.isactive = TRUE
  AND b.isdeleted = FALSE;

-- ============================================================================
-- SECTION 8: IDENTIFY SPECIFIC ISSUES
-- ============================================================================

-- Issue Check 1: Are there NO clients at all?
SELECT
  CASE
    WHEN (SELECT COUNT(*) FROM clients) = 0 THEN '❌ CRITICAL: No clients in database'
    WHEN (SELECT COUNT(*) FROM clients WHERE is_active = TRUE) = 0 THEN '❌ CRITICAL: No active clients'
    ELSE '✅ Clients exist and are active'
  END as clients_status;

-- Issue Check 2: Are there NO branches at all?
SELECT
  CASE
    WHEN (SELECT COUNT(*) FROM client_branches) = 0 THEN '❌ CRITICAL: No branches in database'
    WHEN (SELECT COUNT(*) FROM client_branches WHERE isactive = TRUE AND isdeleted = FALSE) = 0 THEN '❌ CRITICAL: No active branches'
    ELSE '✅ Branches exist and are active'
  END as branches_status;

-- Issue Check 3: Are clients and branches disconnected?
SELECT
  CASE
    WHEN (SELECT COUNT(*) FROM clients c INNER JOIN client_branches b ON c.id = b.clientid WHERE c.is_active = TRUE AND b.isactive = TRUE AND b.isdeleted = FALSE) = 0 THEN '❌ CRITICAL: No client-branch relationships'
    ELSE '✅ Client-branch relationships exist'
  END as relationships_status;

-- Issue Check 4: Contractors table
SELECT
  CASE
    WHEN (SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contractors')) = FALSE THEN '❌ CRITICAL: Contractors table does not exist'
    WHEN (SELECT COUNT(*) FROM contractors) = 0 THEN '❌ WARNING: Contractors table exists but is empty'
    WHEN (SELECT COUNT(*) FROM contractors WHERE is_active = TRUE) = 0 THEN '⚠️  WARNING: No active contractors'
    ELSE '✅ Contractors table has data'
  END as contractors_status;

-- ============================================================================
-- SECTION 9: DETAILED DATA SAMPLE
-- ============================================================================

-- Show detailed sample of clients
SELECT
  'Clients Sample' as section,
  id,
  name::text,
  is_active::text
FROM clients
LIMIT 5;

-- Show detailed sample of branches
SELECT
  'Branches Sample' as section,
  id::text,
  branchname::text,
  clientid::text,
  state_code::text,
  isactive::text,
  isdeleted::text
FROM client_branches
LIMIT 5;

-- ============================================================================
-- END OF INVESTIGATION SCRIPT
-- ============================================================================
--
-- INTERPRETATION GUIDE:
--
-- ✅ Status = Data exists and is properly configured
-- ❌ Status = Critical issue - no data or wrong configuration
-- ⚠️  Status = Warning - data exists but may have issues
--
-- NEXT STEPS:
-- 1. Review all results above
-- 2. Identify which data is missing
-- 3. Use appropriate correction procedure from CORRECTIONS section
--
-- ============================================================================
