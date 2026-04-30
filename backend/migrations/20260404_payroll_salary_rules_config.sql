-- ============================================================================
-- PAYROLL SALARY RULES CONFIGURATION
-- ============================================================================
-- Rules implemented:
--   1. ACTUAL_GROSS = Total Salary (input)
--   2. BASIC = 50% of Gross if Gross > 30000, else 15000, if Gross < 15000 then Basic = Gross
--      Basic must not be less than Minimum Wages (PARAM "MIN_WAGES")
--   3. HRA = 50% of Basic if Gross > 30000
--   4. OTHERS = Gross - Basic - HRA (balancing)
--   5. Attendance Bonus: ₹2000 if LOP ≤ 1
--   6. Leave: 1.5 paid leaves/month, carry forward enabled
--   7. PT as per Telangana rules (state code TS)
--   8. PF only when gross > 30000, ceiling 15000
--   9. ESI as per rules (ceiling 21000)
-- ============================================================================

-- ── Step 1: Add pf_gross_threshold column if missing ─────────────────────────
ALTER TABLE payroll_client_setup
  ADD COLUMN IF NOT EXISTS pf_gross_threshold numeric(14,2) DEFAULT 0;

COMMENT ON COLUMN payroll_client_setup.pf_gross_threshold IS
  'PF only applies when gross exceeds this amount. 0 = apply to all employees.';

-- ── Step 2: Seed Telangana PT slabs (state code = TS) ────────────────────────
-- Telangana Professional Tax slabs (FY 2025-26 / 2026-27):
--   Gross ≤  15000   → PT =   0
--   15001 – 20000    → PT = 150
--   > 20000          → PT = 200
-- Note: February PT for > 20000 is 300 (annual adjustment) - handle in processing
-- These are inserted per-client. Replace <CLIENT_ID> with actual UUID.

-- We insert for ALL existing clients that have PT enabled,
-- but only where TS slabs don't already exist.
INSERT INTO payroll_statutory_slabs (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
SELECT
  gen_random_uuid(),
  cs.client_id,
  'TS',
  'PT',
  0,
  15000,
  0,
  NOW()
FROM payroll_client_setup cs
WHERE cs.pt_enabled = true
  AND NOT EXISTS (
    SELECT 1 FROM payroll_statutory_slabs s
    WHERE s.client_id = cs.client_id AND s.state_code = 'TS' AND s.component_code = 'PT'
  );

INSERT INTO payroll_statutory_slabs (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
SELECT
  gen_random_uuid(),
  cs.client_id,
  'TS',
  'PT',
  15001,
  20000,
  150,
  NOW()
FROM payroll_client_setup cs
WHERE cs.pt_enabled = true
  AND NOT EXISTS (
    SELECT 1 FROM payroll_statutory_slabs s
    WHERE s.client_id = cs.client_id AND s.state_code = 'TS' AND s.component_code = 'PT'
      AND s.from_amount = 15001
  );

INSERT INTO payroll_statutory_slabs (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
SELECT
  gen_random_uuid(),
  cs.client_id,
  'TS',
  'PT',
  20001,
  NULL,
  200,
  NOW()
FROM payroll_client_setup cs
WHERE cs.pt_enabled = true
  AND NOT EXISTS (
    SELECT 1 FROM payroll_statutory_slabs s
    WHERE s.client_id = cs.client_id AND s.state_code = 'TS' AND s.component_code = 'PT'
      AND s.from_amount = 20001
  );

-- ============================================================================
-- NOTES FOR MANUAL SETUP (per client)
-- ============================================================================
-- After running this migration, for EACH client you must:
--
-- A) UPDATE CLIENT SETUP (set thresholds & leave settings):
--    UPDATE payroll_client_setup
--    SET pf_gross_threshold   = 30000,
--        pf_enabled           = true,
--        pf_wage_ceiling      = 15000,
--        esi_enabled          = true,
--        esi_wage_ceiling      = 21000,
--        pt_enabled           = true,
--        leave_accrual_per_month = 1.5,
--        allow_carry_forward  = true,
--        max_carry_forward    = 30
--    WHERE client_id = '<CLIENT_UUID>';
--
-- B) CREATE PAYROLL COMPONENTS (run from Payroll Setup > Components UI or SQL):
--    Code           | Name               | Type      | Taxable | PF Wage | ESI Wage | Order
--    ACTUAL_GROSS   | Actual Gross       | EARNING   | true    | false   | false    | 1
--    BASIC          | Basic Salary       | EARNING   | true    | true    | true     | 2
--    HRA            | House Rent Allow.  | EARNING   | false   | false   | true     | 3
--    OTHERS         | Other Allowances   | EARNING   | true    | false   | true     | 4
--    ATT_BONUS      | Attendance Bonus   | EARNING   | true    | false   | true     | 5
--    PF_EMP         | PF (Employee)      | DEDUCTION | false   | false   | false    | 10
--    PF_ER          | PF (Employer)      | EMPLOYER  | false   | false   | false    | 11
--    ESI_EMP        | ESI (Employee)     | DEDUCTION | false   | false   | false    | 12
--    ESI_ER         | ESI (Employer)     | EMPLOYER  | false   | false   | false    | 13
--    PT             | Professional Tax   | DEDUCTION | false   | false   | false    | 14
--    NET_PAY        | Net Pay            | INFO      | false   | false   | false    | 99
--
-- C) CREATE RULE SET with MIN_WAGES parameter:
--    INSERT INTO pay_rule_sets (id, client_id, name, effective_from, is_active)
--    VALUES (gen_random_uuid(), '<CLIENT_UUID>', 'Standard Rules Apr-Sep 2026', '2026-04-01', true);
--
--    INSERT INTO pay_rule_parameters (id, rule_set_id, key, value_num, unit, notes)
--    VALUES (gen_random_uuid(), '<RULESET_UUID>', 'MIN_WAGES', 15000, 'INR',
--            'Minimum wages - update every April and October');
--
-- D) CREATE SALARY STRUCTURE with formula items (via Structures Builder UI or SQL):
--    Component    | Calc Method | Formula / Config
--    ACTUAL_GROSS | FIXED       | (amount comes from uploaded input)
--    BASIC        | FORMULA     | MAX(IF(ACTUAL_GROSS < 15000, ACTUAL_GROSS, IF(ACTUAL_GROSS > 30000, ACTUAL_GROSS * 0.50, 15000)), PARAM("MIN_WAGES"))
--    HRA          | FORMULA     | IF(ACTUAL_GROSS > 30000, BASIC * 0.50, 0)
--    OTHERS       | FORMULA     | MAX(ACTUAL_GROSS - BASIC - HRA, 0)
--    ATT_BONUS    | FORMULA     | IF(LOP_DAYS <= 1, 2000, 0)
--
--    Priority order: ACTUAL_GROSS=1, BASIC=2, HRA=3, OTHERS=4, ATT_BONUS=5
--    (ensures BASIC is calculated before HRA, HRA before OTHERS, etc.)
-- ============================================================================
