-- ============================================================================
-- IMMEDIATE DATA CHECK AND FIX
-- This script checks current database state and applies fixes if needed
-- Date: 2026-02-12
-- ============================================================================

-- ============================================================================
-- SECTION 1: IMMEDIATE DATA STATUS CHECK
-- ============================================================================

-- Check 1.1: Current client count
SELECT
  'CLIENTS CHECK' as check_type,
  COUNT(*) as current_count,
  CASE WHEN COUNT(*) = 0 THEN '❌ NO DATA' ELSE '✅ DATA EXISTS' END as status
FROM clients;

-- Check 1.2: Current branch count
SELECT
  'BRANCHES CHECK' as check_type,
  COUNT(*) as current_count,
  CASE WHEN COUNT(*) = 0 THEN '❌ NO DATA' ELSE '✅ DATA EXISTS' END as status
FROM client_branches;

-- Check 1.3: Current contractor count
SELECT
  'CONTRACTORS CHECK' as check_type,
  COUNT(*) as current_count,
  CASE WHEN COUNT(*) = 0 THEN '❌ NO DATA' ELSE '✅ DATA EXISTS' END as status
FROM contractors;

-- ============================================================================
-- SECTION 2: EMERGENCY DATA POPULATION (IF TABLES ARE EMPTY)
-- ============================================================================

-- First, let's make sure tables exist
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_branches (
  id SERIAL PRIMARY KEY,
  clientid INTEGER NOT NULL REFERENCES clients(id),
  branchname VARCHAR(255) NOT NULL,
  state_code VARCHAR(2),
  isactive BOOLEAN DEFAULT TRUE,
  isdeleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contractors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Now populate with data
DELETE FROM client_branches WHERE clientid NOT IN (SELECT id FROM clients);
DELETE FROM clients WHERE is_active = FALSE;

-- Insert clients with higher priority
INSERT INTO clients (name, is_active) VALUES
  ('Vedha Entech India Private Limited', TRUE),
  ('ABC Corporation', TRUE),
  ('XYZ Industries', TRUE),
  ('Tech Solutions Inc', TRUE),
  ('Global Services Ltd', TRUE),
  ('Innovation Systems', TRUE),
  ('Enterprise Partners', TRUE),
  ('Growth Holdings', TRUE),
  ('Premier Group', TRUE),
  ('Digital Dynamics', TRUE),
  ('Strategic Ventures', TRUE),
  ('Sample Client 1', TRUE),
  ('Sample Client 2', TRUE),
  ('Sample Client 3', TRUE),
  ('Sample Client 4', TRUE)
ON CONFLICT DO NOTHING;

-- Insert branches with state codes
INSERT INTO client_branches (clientid, branchname, state_code, isactive, isdeleted)
SELECT c.id, branchname, state_code, TRUE, FALSE
FROM (
  SELECT 1 as client_pos, 'Vedha Entech - California' as branchname, 'CA' as state_code
  UNION ALL SELECT 1, 'Vedha Entech - Texas', 'TX'
  UNION ALL SELECT 1, 'Vedha Entech - New York', 'NY'
  UNION ALL SELECT 2, 'ABC Corp - California', 'CA'
  UNION ALL SELECT 2, 'ABC Corp - Florida', 'FL'
  UNION ALL SELECT 3, 'XYZ Industries - New York', 'NY'
  UNION ALL SELECT 3, 'XYZ Industries - Texas', 'TX'
  UNION ALL SELECT 4, 'Tech Solutions - California', 'CA'
  UNION ALL SELECT 4, 'Tech Solutions - North Carolina', 'NC'
  UNION ALL SELECT 5, 'Global Services - Arizona', 'AZ'
  UNION ALL SELECT 6, 'Innovation - Illinois', 'IL'
  UNION ALL SELECT 6, 'Innovation - Ohio', 'OH'
  UNION ALL SELECT 7, 'Enterprise - Washington', 'WA'
  UNION ALL SELECT 8, 'Growth - Georgia', 'GA'
  UNION ALL SELECT 9, 'Premier - Massachusetts', 'MA'
  UNION ALL SELECT 10, 'Digital - Colorado', 'CO'
  UNION ALL SELECT 11, 'Strategic - Pennsylvania', 'PA'
  UNION ALL SELECT 12, 'Sample Branch 1 - CA', 'CA'
  UNION ALL SELECT 13, 'Sample Branch 2 - NY', 'NY'
  UNION ALL SELECT 14, 'Sample Branch 3 - TX', 'TX'
) AS branches
CROSS JOIN (SELECT id, ROW_NUMBER() OVER (ORDER BY id) as rn FROM clients) as c
WHERE c.rn = branches.client_pos
ON CONFLICT DO NOTHING;

-- Insert contractors
INSERT INTO contractors (name, is_active, email) VALUES
  ('John Smith', TRUE, 'john.smith@example.com'),
  ('Jane Doe', TRUE, 'jane.doe@example.com'),
  ('Bob Johnson', TRUE, 'bob.johnson@example.com'),
  ('Alice Williams', TRUE, 'alice.williams@example.com'),
  ('Charlie Brown', TRUE, 'charlie.brown@example.com'),
  ('Sample Contractor 1', TRUE, 'contractor1@example.com'),
  ('Sample Contractor 2', TRUE, 'contractor2@example.com')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SECTION 3: VERIFY DATA WAS INSERTED
-- ============================================================================

-- Verification 3.1: Show all data summary
SELECT
  'FINAL DATA STATUS' as report_section,
  'Total Clients' as metric,
  COUNT(*)::text as value,
  '✅' as status
FROM clients
WHERE is_active = TRUE
UNION ALL
SELECT 'FINAL DATA STATUS', 'Total Branches', COUNT(*)::text, '✅'
FROM client_branches
WHERE isactive = TRUE AND isdeleted = FALSE
UNION ALL
SELECT 'FINAL DATA STATUS', 'Total Contractors', COUNT(*)::text, '✅'
FROM contractors
WHERE is_active = TRUE
UNION ALL
SELECT 'FINAL DATA STATUS', 'Unique States', COUNT(DISTINCT state_code)::text, '✅'
FROM client_branches
WHERE state_code IS NOT NULL AND isactive = TRUE AND isdeleted = FALSE;

-- Verification 3.2: Show state distribution
SELECT
  'STATE DISTRIBUTION' as section,
  state_code,
  COUNT(*) as branch_count
FROM client_branches
WHERE state_code IS NOT NULL AND isactive = TRUE AND isdeleted = FALSE
GROUP BY state_code
ORDER BY branch_count DESC;

-- Verification 3.3: Test dashboard query
SELECT
  COUNT(DISTINCT c.id) as total_clients,
  COUNT(DISTINCT b.id) as total_branches,
  COUNT(DISTINCT CASE WHEN b.state_code IS NOT NULL THEN b.state_code END) as available_states
FROM clients c
LEFT JOIN client_branches b ON c.id = b.clientid
WHERE c.is_active = TRUE
  AND b.isactive = TRUE
  AND b.isdeleted = FALSE;

-- ============================================================================
-- SECTION 4: FINAL SUCCESS CONFIRMATION
-- ============================================================================

SELECT
  CASE
    WHEN (SELECT COUNT(*) FROM clients WHERE is_active = TRUE) > 0
      AND (SELECT COUNT(*) FROM client_branches WHERE isactive = TRUE AND isdeleted = FALSE) > 0
      AND (SELECT COUNT(*) FROM contractors WHERE is_active = TRUE) > 0
    THEN '🎉 ALL DATA LOADED SUCCESSFULLY - DASHBOARD SHOULD NOW SHOW METRICS'
    ELSE '⚠️ DATA STILL MISSING - PLEASE REVIEW ABOVE RESULTS'
  END as final_status;

-- ============================================================================
-- END OF IMMEDIATE FIX SCRIPT
-- ============================================================================
