-- ============================================================================
-- CLEANUP: Remove all sample/demo data from the database
-- ALREADY EXECUTED on 2026-02-23. No need to run again.
-- Safe to run multiple times (idempotent) — all DELETEs target 0 rows now.
-- ============================================================================

BEGIN;

-- ── 1. Remove fake contractors (example.com emails, sample names) ──
DELETE FROM contractors WHERE email LIKE '%@example.com';
DELETE FROM contractors WHERE name IN (
  'John Smith', 'Jane Doe', 'Bob Johnson', 'Alice Williams', 'Charlie Brown',
  'Sample Contractor 1', 'Sample Contractor 2'
);

-- ── 2. Remove fake branches tied to fake clients ──
DELETE FROM client_branches WHERE clientid IN (
  SELECT id FROM clients WHERE name IN (
    'ABC Corporation', 'XYZ Industries', 'Tech Solutions Inc',
    'Global Services Ltd', 'Innovation Systems', 'Enterprise Partners',
    'Growth Holdings', 'Premier Group', 'Digital Dynamics', 'Strategic Ventures',
    'Sample Client 1', 'Sample Client 2', 'Sample Client 3', 'Sample Client 4'
  )
);

-- Also remove branches with obviously sample names
DELETE FROM client_branches WHERE branchname LIKE 'Sample Branch%';
DELETE FROM client_branches WHERE branchname LIKE 'ABC Corp -%';
DELETE FROM client_branches WHERE branchname LIKE 'XYZ Industries -%';
DELETE FROM client_branches WHERE branchname LIKE 'Tech Solutions -%';
DELETE FROM client_branches WHERE branchname LIKE 'Global Services -%';
DELETE FROM client_branches WHERE branchname LIKE 'Innovation -%';
DELETE FROM client_branches WHERE branchname LIKE 'Enterprise -%';
DELETE FROM client_branches WHERE branchname LIKE 'Growth -%';
DELETE FROM client_branches WHERE branchname LIKE 'Premier -%';
DELETE FROM client_branches WHERE branchname LIKE 'Digital Dynamics -%';
DELETE FROM client_branches WHERE branchname LIKE 'Strategic Ventures -%';
DELETE FROM client_branches WHERE branchname LIKE 'Digital -%' AND branchname LIKE '% - CO';
DELETE FROM client_branches WHERE branchname LIKE 'Strategic -%' AND branchname LIKE '% - PA';

-- ── 3. Remove compliance tasks tied to fake clients ──
DELETE FROM compliance_tasks WHERE client_id IN (
  SELECT id::uuid FROM clients WHERE name IN (
    'ABC Corporation', 'XYZ Industries', 'Tech Solutions Inc',
    'Global Services Ltd', 'Innovation Systems', 'Enterprise Partners',
    'Growth Holdings', 'Premier Group', 'Digital Dynamics', 'Strategic Ventures',
    'Sample Client 1', 'Sample Client 2', 'Sample Client 3', 'Sample Client 4'
  )
);

-- ── 4. Remove fake clients ──
DELETE FROM clients WHERE name IN (
  'ABC Corporation', 'XYZ Industries', 'Tech Solutions Inc',
  'Global Services Ltd', 'Innovation Systems', 'Enterprise Partners',
  'Growth Holdings', 'Premier Group', 'Digital Dynamics', 'Strategic Ventures',
  'Sample Client 1', 'Sample Client 2', 'Sample Client 3', 'Sample Client 4'
);

-- ── 5. Remove users with test @example.com emails (if any) ──
DELETE FROM users WHERE email LIKE '%@example.com';

COMMIT;

-- ── 6. Verification: show remaining live data counts ──
SELECT 'clients' AS entity, COUNT(*) AS remaining FROM clients WHERE is_active = TRUE
UNION ALL
SELECT 'branches', COUNT(*) FROM client_branches WHERE isactive = TRUE AND isdeleted = FALSE
UNION ALL
SELECT 'contractors', COUNT(*) FROM contractors WHERE is_active = TRUE
UNION ALL
SELECT 'compliance_tasks', COUNT(*) FROM compliance_tasks;
