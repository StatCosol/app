-- ==========================================
-- Fix user roles, seed client + branches
-- ==========================================

BEGIN;

-- 1. Populate the denormalized `role` column from the roles table
UPDATE users u
SET role = r.code
FROM roles r
WHERE r.id = u.role_id
  AND (u.role IS NULL OR u.role = '');

-- 2. Create a test client (company)
INSERT INTO clients (id, client_code, client_name, status, is_active, primary_contact_name, primary_contact_email, state, industry)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'VEDHA-001',
  'Vedha Enterprise Technologies',
  'ACTIVE',
  true,
  'Sravan',
  'sravan@vedhaentch.com',
  'Telangana',
  'IT Services'
)
ON CONFLICT (client_code) DO NOTHING;

-- 3. Link the CLIENT user to this client + set user_type=MASTER
UPDATE users
SET client_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    user_type = 'MASTER'
WHERE email = 'sravan@vedhaentch.com';

-- 4. Link the CONTRACTOR user to this client
UPDATE users
SET client_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
WHERE email = 'srisai@gmail.com';

-- 5. Create test branches for the client
INSERT INTO client_branches (id, clientid, branchname, branchtype, statecode, establishment_type, city, pincode, address, employeecount, contractorcount, status, isactive, isdeleted)
VALUES
  ('b1000001-0001-4000-a000-000000000001', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Hyderabad HQ', 'HEAD_OFFICE', 'TS', 'FACTORY', 'Hyderabad', '500081', 'Plot 45, HITEC City, Hyderabad', 50, 5, 'ACTIVE', true, false),
  ('b1000001-0001-4000-a000-000000000002', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Vizag Branch', 'BRANCH', 'AP', 'SHOP', 'Visakhapatnam', '530001', '12-34, MVP Colony, Vizag', 25, 3, 'ACTIVE', true, false),
  ('b1000001-0001-4000-a000-000000000003', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Bangalore Office', 'BRANCH', 'KA', 'BRANCH', 'Bengaluru', '560001', 'MG Road, Bangalore', 30, 2, 'ACTIVE', true, false)
ON CONFLICT DO NOTHING;

-- 6. Create client_assignments to link CRM and AUDITOR to this client
INSERT INTO client_assignments (id, client_id, crm_user_id, auditor_user_id, start_date, end_date, status, created_by)
VALUES (
  'ca000001-0001-4000-a000-000000000001',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  '5e137bb7-d097-4d97-bddf-d8c99a67065b',  -- CRM: slvmgmtconsultants@gmail.com
  'aa466961-c4e2-4a85-a495-af277cc57c0d',  -- AUDITOR: payroll_audit@statcosol.com
  '2026-01-01',
  '2026-12-31',
  'ACTIVE',
  '9e0a10a4-7240-40a6-8cf3-731cb9521b53'   -- ADMIN
)
ON CONFLICT DO NOTHING;

-- 7. Link CRM user to client
UPDATE users
SET client_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
WHERE email = 'slvmgmtconsultants@gmail.com'
  AND client_id IS NULL;

-- 8. Create a client_users entry for the CLIENT master user
INSERT INTO client_users (id, client_id, user_id, created_at)
VALUES (
  'c1000001-0001-4000-a000-000000000001',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  (SELECT id FROM users WHERE email = 'sravan@vedhaentch.com'),
  NOW()
)
ON CONFLICT DO NOTHING;

COMMIT;
