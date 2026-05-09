-- ════════════════════════════════════════════════════════════════════════════
-- Global Professional Tax (PT) and Labour Welfare Fund (LWF) slabs
-- ════════════════════════════════════════════════════════════════════════════
-- Until now PT/LWF slabs in payroll_statutory_slabs were seeded only for
-- Telangana per-client (via seed-veipl-payroll, seed-logiq-mfg-payroll,
-- 20260414_logiq_payroll_config.sql). For any client whose employees are in
-- another state, StateSlabService.resolveAmount() returned 0 silently.
--
-- This migration inserts cross-client default slabs (client_id = NULL) for the
-- common Indian states. StateSlabService falls back to stateCode = 'ALL' rows
-- only — but it queries by clientId. To keep the existing per-client lookup
-- semantics intact while still providing a global default, we use a sentinel
-- all-zeroes UUID as the "shared" client_id and broaden the service in the
-- next code change to fall back to that sentinel when no per-client slab is
-- found.
--
-- Source: standard state PT statutes (FY 2025-26).
-- Slab amounts are monthly PT in INR. Annual cap of ₹2,500 enforced upstream.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_shared CONSTANT UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  -- Drop the FK constraint to clients(id) so the sentinel "shared" client_id
  -- can be used for cross-tenant default slabs without requiring a stub
  -- clients row. Lookups remain by exact UUID match in StateSlabService.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payroll_statutory_slabs_client_id_fkey'
  ) THEN
    ALTER TABLE payroll_statutory_slabs
      DROP CONSTRAINT payroll_statutory_slabs_client_id_fkey;
  END IF;

  -- Wipe any prior shared slabs so re-running this migration is idempotent.
  DELETE FROM payroll_statutory_slabs WHERE client_id = v_shared;

  -- ─────────────────────────────────────────────────────────────────────────
  -- TELANGANA (TS)
  -- ─────────────────────────────────────────────────────────────────────────
  INSERT INTO payroll_statutory_slabs
    (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
  VALUES
    (gen_random_uuid(), v_shared, 'TS', 'PT', 0,     15000, 0,   NOW()),
    (gen_random_uuid(), v_shared, 'TS', 'PT', 15001, 20000, 150, NOW()),
    (gen_random_uuid(), v_shared, 'TS', 'PT', 20001, NULL,  200, NOW());

  -- ─────────────────────────────────────────────────────────────────────────
  -- ANDHRA PRADESH (AP) — same as Telangana
  -- ─────────────────────────────────────────────────────────────────────────
  INSERT INTO payroll_statutory_slabs
    (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
  VALUES
    (gen_random_uuid(), v_shared, 'AP', 'PT', 0,     15000, 0,   NOW()),
    (gen_random_uuid(), v_shared, 'AP', 'PT', 15001, 20000, 150, NOW()),
    (gen_random_uuid(), v_shared, 'AP', 'PT', 20001, NULL,  200, NOW());

  -- ─────────────────────────────────────────────────────────────────────────
  -- KARNATAKA (KA)
  -- 0–24999 = 0; 25000+ = 200 (₹300 in February for annual cap of ₹2400)
  -- ─────────────────────────────────────────────────────────────────────────
  INSERT INTO payroll_statutory_slabs
    (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
  VALUES
    (gen_random_uuid(), v_shared, 'KA', 'PT', 0,     24999, 0,   NOW()),
    (gen_random_uuid(), v_shared, 'KA', 'PT', 25000, NULL,  200, NOW());

  -- ─────────────────────────────────────────────────────────────────────────
  -- TAMIL NADU (TN) — half-yearly slabs converted to monthly average
  -- 0–21000 = 0; 21001–30000 = 135; 30001–45000 = 315;
  -- 45001–60000 = 690; 60001–75000 = 1025; 75001+ = 1250
  -- ─────────────────────────────────────────────────────────────────────────
  INSERT INTO payroll_statutory_slabs
    (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
  VALUES
    (gen_random_uuid(), v_shared, 'TN', 'PT', 0,     21000, 0,    NOW()),
    (gen_random_uuid(), v_shared, 'TN', 'PT', 21001, 30000, 135,  NOW()),
    (gen_random_uuid(), v_shared, 'TN', 'PT', 30001, 45000, 315,  NOW()),
    (gen_random_uuid(), v_shared, 'TN', 'PT', 45001, 60000, 690,  NOW()),
    (gen_random_uuid(), v_shared, 'TN', 'PT', 60001, 75000, 1025, NOW()),
    (gen_random_uuid(), v_shared, 'TN', 'PT', 75001, NULL,  1250, NOW());

  -- ─────────────────────────────────────────────────────────────────────────
  -- MAHARASHTRA (MH)
  -- Male: 0–7500 = 0; 7501–10000 = 175; 10001+ = 200 (Feb = 300)
  -- Note: Female PT exempt up to 25000 — not modelled here (gender-aware
  -- slabs would need an extra column). Most payrolls treat as male slabs.
  -- ─────────────────────────────────────────────────────────────────────────
  INSERT INTO payroll_statutory_slabs
    (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
  VALUES
    (gen_random_uuid(), v_shared, 'MH', 'PT', 0,     7500,  0,   NOW()),
    (gen_random_uuid(), v_shared, 'MH', 'PT', 7501,  10000, 175, NOW()),
    (gen_random_uuid(), v_shared, 'MH', 'PT', 10001, NULL,  200, NOW());

  -- ─────────────────────────────────────────────────────────────────────────
  -- WEST BENGAL (WB)
  -- 0–10000 = 0; 10001–15000 = 110; 15001–25000 = 130;
  -- 25001–40000 = 150; 40001+ = 200
  -- ─────────────────────────────────────────────────────────────────────────
  INSERT INTO payroll_statutory_slabs
    (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
  VALUES
    (gen_random_uuid(), v_shared, 'WB', 'PT', 0,     10000, 0,   NOW()),
    (gen_random_uuid(), v_shared, 'WB', 'PT', 10001, 15000, 110, NOW()),
    (gen_random_uuid(), v_shared, 'WB', 'PT', 15001, 25000, 130, NOW()),
    (gen_random_uuid(), v_shared, 'WB', 'PT', 25001, 40000, 150, NOW()),
    (gen_random_uuid(), v_shared, 'WB', 'PT', 40001, NULL,  200, NOW());

  -- ─────────────────────────────────────────────────────────────────────────
  -- GUJARAT (GJ)
  -- 0–12000 = 0; 12001+ = 200
  -- ─────────────────────────────────────────────────────────────────────────
  INSERT INTO payroll_statutory_slabs
    (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
  VALUES
    (gen_random_uuid(), v_shared, 'GJ', 'PT', 0,     12000, 0,   NOW()),
    (gen_random_uuid(), v_shared, 'GJ', 'PT', 12001, NULL,  200, NOW());

  -- ─────────────────────────────────────────────────────────────────────────
  -- KERALA (KL) — half-yearly slabs averaged to monthly
  -- 0–11999 = 0; 12000–17999 = 120; 18000–29999 = 180;
  -- 30000–44999 = 300; 45000–59999 = 450; 60000–74999 = 600;
  -- 75000–99999 = 750; 100000–124999 = 1000; 125000+ = 1250
  -- ─────────────────────────────────────────────────────────────────────────
  INSERT INTO payroll_statutory_slabs
    (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
  VALUES
    (gen_random_uuid(), v_shared, 'KL', 'PT', 0,      11999,  0,    NOW()),
    (gen_random_uuid(), v_shared, 'KL', 'PT', 12000,  17999,  120,  NOW()),
    (gen_random_uuid(), v_shared, 'KL', 'PT', 18000,  29999,  180,  NOW()),
    (gen_random_uuid(), v_shared, 'KL', 'PT', 30000,  44999,  300,  NOW()),
    (gen_random_uuid(), v_shared, 'KL', 'PT', 45000,  59999,  450,  NOW()),
    (gen_random_uuid(), v_shared, 'KL', 'PT', 60000,  74999,  600,  NOW()),
    (gen_random_uuid(), v_shared, 'KL', 'PT', 75000,  99999,  750,  NOW()),
    (gen_random_uuid(), v_shared, 'KL', 'PT', 100000, 124999, 1000, NOW()),
    (gen_random_uuid(), v_shared, 'KL', 'PT', 125000, NULL,   1250, NOW());

  -- ─────────────────────────────────────────────────────────────────────────
  -- ODISHA (OR / OD)
  -- 0–13304 = 0; 13305–25000 = 125; 25001+ = 200 (Feb = 300)
  -- ─────────────────────────────────────────────────────────────────────────
  INSERT INTO payroll_statutory_slabs
    (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
  VALUES
    (gen_random_uuid(), v_shared, 'OR', 'PT', 0,     13304, 0,   NOW()),
    (gen_random_uuid(), v_shared, 'OR', 'PT', 13305, 25000, 125, NOW()),
    (gen_random_uuid(), v_shared, 'OR', 'PT', 25001, NULL,  200, NOW()),
    (gen_random_uuid(), v_shared, 'OD', 'PT', 0,     13304, 0,   NOW()),
    (gen_random_uuid(), v_shared, 'OD', 'PT', 13305, 25000, 125, NOW()),
    (gen_random_uuid(), v_shared, 'OD', 'PT', 25001, NULL,  200, NOW());

  -- ─────────────────────────────────────────────────────────────────────────
  -- ASSAM (AS), MADHYA PRADESH (MP), MEGHALAYA (ML), SIKKIM (SK),
  -- TRIPURA (TR), JHARKHAND (JH), BIHAR (BR), CHHATTISGARH (CG),
  -- PUNJAB (PB), MIZORAM (MZ), MANIPUR (MN), NAGALAND (NL)
  -- Generic two-bracket fallback: 0–15000 = 0; 15001+ = 200
  -- (Each state has its own table; this is a SAFE DEFAULT — clients with
  -- employees in these states should override with per-client slabs.)
  -- ─────────────────────────────────────────────────────────────────────────
  INSERT INTO payroll_statutory_slabs
    (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
  SELECT gen_random_uuid(), v_shared, sc, 'PT', 0, 15000, 0, NOW()
  FROM (VALUES ('AS'),('MP'),('ML'),('SK'),('TR'),('JH'),('BR'),('CG'),
               ('PB'),('MZ'),('MN'),('NL')) AS s(sc);

  INSERT INTO payroll_statutory_slabs
    (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
  SELECT gen_random_uuid(), v_shared, sc, 'PT', 15001, NULL, 200, NOW()
  FROM (VALUES ('AS'),('MP'),('ML'),('SK'),('TR'),('JH'),('BR'),('CG'),
               ('PB'),('MZ'),('MN'),('NL')) AS s(sc);

  -- ─────────────────────────────────────────────────────────────────────────
  -- States with NO Professional Tax (file empty 0-row so resolver short-circuits):
  -- Delhi (DL), UP (UP), Uttarakhand (UK / UT), Haryana (HR), Rajasthan (RJ),
  -- J&K (JK), HP (HP), Goa (GA), Andaman & Nicobar (AN), Chandigarh (CH),
  -- Lakshadweep (LD), Puducherry (PY), Dadra-Nagar-Haveli (DN), Daman-Diu (DD)
  -- ─────────────────────────────────────────────────────────────────────────
  INSERT INTO payroll_statutory_slabs
    (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
  SELECT gen_random_uuid(), v_shared, sc, 'PT', 0, NULL, 0, NOW()
  FROM (VALUES ('DL'),('UP'),('UK'),('UT'),('HR'),('RJ'),('JK'),('HP'),
               ('GA'),('AN'),('CH'),('LD'),('PY'),('DN'),('DD')) AS s(sc);

  -- ════════════════════════════════════════════════════════════════════════
  -- LABOUR WELFARE FUND (LWF) — flat monthly contributions
  -- Where states have half-yearly LWF, monthly equivalent is recorded.
  -- Employee LWF stored under LWF_EMP, Employer under LWF_ER.
  -- ════════════════════════════════════════════════════════════════════════

  -- KARNATAKA: Employee ₹20, Employer ₹40 — annual, billed Dec
  INSERT INTO payroll_statutory_slabs
    (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
  VALUES
    (gen_random_uuid(), v_shared, 'KA', 'LWF_EMP', 0, NULL, 20, NOW()),
    (gen_random_uuid(), v_shared, 'KA', 'LWF_ER',  0, NULL, 40, NOW());

  -- TAMIL NADU: Employee ₹10, Employer ₹20
  INSERT INTO payroll_statutory_slabs
    (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
  VALUES
    (gen_random_uuid(), v_shared, 'TN', 'LWF_EMP', 0, NULL, 10, NOW()),
    (gen_random_uuid(), v_shared, 'TN', 'LWF_ER',  0, NULL, 20, NOW());

  -- MAHARASHTRA: Employee ₹25, Employer ₹75 (half-yearly)
  INSERT INTO payroll_statutory_slabs
    (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
  VALUES
    (gen_random_uuid(), v_shared, 'MH', 'LWF_EMP', 0, NULL, 25, NOW()),
    (gen_random_uuid(), v_shared, 'MH', 'LWF_ER',  0, NULL, 75, NOW());

  -- KERALA: Employee ₹50, Employer ₹50 (monthly)
  INSERT INTO payroll_statutory_slabs
    (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
  VALUES
    (gen_random_uuid(), v_shared, 'KL', 'LWF_EMP', 0, NULL, 50, NOW()),
    (gen_random_uuid(), v_shared, 'KL', 'LWF_ER',  0, NULL, 50, NOW());

  -- GUJARAT: Employee ₹6, Employer ₹12
  INSERT INTO payroll_statutory_slabs
    (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
  VALUES
    (gen_random_uuid(), v_shared, 'GJ', 'LWF_EMP', 0, NULL, 6,  NOW()),
    (gen_random_uuid(), v_shared, 'GJ', 'LWF_ER',  0, NULL, 12, NOW());

  -- WEST BENGAL: Employee ₹3, Employer ₹15
  INSERT INTO payroll_statutory_slabs
    (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
  VALUES
    (gen_random_uuid(), v_shared, 'WB', 'LWF_EMP', 0, NULL, 3,  NOW()),
    (gen_random_uuid(), v_shared, 'WB', 'LWF_ER',  0, NULL, 15, NOW());

  -- HARYANA: Employee ₹31, Employer ₹62
  INSERT INTO payroll_statutory_slabs
    (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
  VALUES
    (gen_random_uuid(), v_shared, 'HR', 'LWF_EMP', 0, NULL, 31, NOW()),
    (gen_random_uuid(), v_shared, 'HR', 'LWF_ER',  0, NULL, 62, NOW());

  -- DELHI: Employee ₹0.75, Employer ₹2.25 — rounded to 1 / 2 (handled by Math.ceil)
  INSERT INTO payroll_statutory_slabs
    (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
  VALUES
    (gen_random_uuid(), v_shared, 'DL', 'LWF_EMP', 0, NULL, 0.75, NOW()),
    (gen_random_uuid(), v_shared, 'DL', 'LWF_ER',  0, NULL, 2.25, NOW());

  -- TELANGANA / ANDHRA PRADESH: Employee ₹2, Employer ₹5 (annual; billed Dec)
  INSERT INTO payroll_statutory_slabs
    (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
  VALUES
    (gen_random_uuid(), v_shared, 'TS', 'LWF_EMP', 0, NULL, 2, NOW()),
    (gen_random_uuid(), v_shared, 'TS', 'LWF_ER',  0, NULL, 5, NOW()),
    (gen_random_uuid(), v_shared, 'AP', 'LWF_EMP', 0, NULL, 2, NOW()),
    (gen_random_uuid(), v_shared, 'AP', 'LWF_ER',  0, NULL, 5, NOW());

  RAISE NOTICE 'Global PT/LWF slabs seeded under shared client_id %', v_shared;
END $$;
