-- ============================================================================
-- LOGIQ EMS – Payroll Engine Configuration
-- ============================================================================
-- Client: Logiq EMS (ashok@logiqems.com)
-- State: Telangana (TS)
--
-- Rules:
--   1. ACTUAL_GROSS = Total Salary (uploaded input)
--   2. BASIC = 50% of Gross if Gross > 30000, else 15000 fixed,
--      if Gross < 15000 then Basic = Gross.
--      Basic must not be less than Minimum Wages (PARAM "MIN_WAGES")
--   3. HRA = 50% of Basic if Gross > 30000, else 0
--   4. OTHERS = Gross - Basic - HRA (balancing/remaining)
--   5. Attendance Bonus: ₹2000 if LOP_DAYS <= 1.5
--   6. Leave: 1.5 paid leaves/month, carry forward enabled
--   7. PT as per Telangana rules
--   8. PF only when gross > 30000, PF wage ceiling = 15000
--   9. ESI as per rules (ceiling 21000)
-- ============================================================================

-- ── Step 0: Look up client_id ────────────────────────────────────────────────
-- We derive client_id from the users table (ashok@logiqems.com is a CLIENT user).
-- All subsequent inserts use this CTE.

DO $$
DECLARE
  v_client_id  uuid;
  v_rs_id      uuid;
  v_struct_id  uuid;
  v_comp_ag    uuid;
  v_comp_bas   uuid;
  v_comp_hra   uuid;
  v_comp_oth   uuid;
  v_comp_att   uuid;
BEGIN

  -- ── Resolve client_id from the CLIENT user ─────────────────────────────────
  SELECT u.client_id INTO v_client_id
  FROM users u
  WHERE u.email = 'ashok@logiqems.com'
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Logiq client not found (no user with email ashok@logiqems.com)';
  END IF;

  RAISE NOTICE 'Logiq client_id = %', v_client_id;

  -- ══════════════════════════════════════════════════════════════════════════
  -- A) PAYROLL CLIENT SETUP (upsert)
  -- ══════════════════════════════════════════════════════════════════════════
  INSERT INTO payroll_client_setup (
    id, client_id,
    pf_enabled, esi_enabled, pt_enabled, lwf_enabled,
    pf_employer_rate, pf_employee_rate,
    esi_employer_rate, esi_employee_rate,
    pf_wage_ceiling, pf_gross_threshold, esi_wage_ceiling,
    pay_cycle, cycle_start_day, payout_day, lock_day,
    leave_accrual_per_month, allow_carry_forward, max_carry_forward, lop_mode,
    attendance_source
  ) VALUES (
    gen_random_uuid(), v_client_id,
    true, true, true, false,        -- PF, ESI, PT enabled; LWF off
    12.00, 12.00,                   -- PF rates
    3.25, 0.75,                     -- ESI rates
    15000, 30000, 21000,            -- PF ceiling, PF threshold (>30k), ESI ceiling
    'MONTHLY', 1, 1, 26,
    1.5, true, 30, 'PRORATED',     -- 1.5 leaves/month, carry forward
    'MANUAL'
  )
  ON CONFLICT (client_id) DO UPDATE SET
    pf_enabled            = EXCLUDED.pf_enabled,
    esi_enabled           = EXCLUDED.esi_enabled,
    pt_enabled            = EXCLUDED.pt_enabled,
    lwf_enabled           = EXCLUDED.lwf_enabled,
    pf_employer_rate      = EXCLUDED.pf_employer_rate,
    pf_employee_rate      = EXCLUDED.pf_employee_rate,
    esi_employer_rate     = EXCLUDED.esi_employer_rate,
    esi_employee_rate     = EXCLUDED.esi_employee_rate,
    pf_wage_ceiling       = EXCLUDED.pf_wage_ceiling,
    pf_gross_threshold    = EXCLUDED.pf_gross_threshold,
    esi_wage_ceiling      = EXCLUDED.esi_wage_ceiling,
    leave_accrual_per_month = EXCLUDED.leave_accrual_per_month,
    allow_carry_forward   = EXCLUDED.allow_carry_forward,
    max_carry_forward     = EXCLUDED.max_carry_forward,
    lop_mode              = EXCLUDED.lop_mode,
    updated_at            = NOW();

  -- ══════════════════════════════════════════════════════════════════════════
  -- B) PAYROLL COMPONENTS
  -- ══════════════════════════════════════════════════════════════════════════
  -- Delete existing components for clean re-seed
  DELETE FROM payroll_components WHERE client_id = v_client_id;

  INSERT INTO payroll_components (id, client_id, code, name, component_type, is_taxable, affects_pf_wage, affects_esi_wage, is_required, display_order, is_active)
  VALUES
    (gen_random_uuid(), v_client_id, 'ACTUAL_GROSS',  'Actual Gross',          'INFO',      false, false, false, true,  1,  true),
    (gen_random_uuid(), v_client_id, 'BASIC',         'Basic Salary',          'EARNING',   true,  true,  true,  true,  2,  true),
    (gen_random_uuid(), v_client_id, 'HRA',           'House Rent Allowance',  'EARNING',   false, false, true,  false, 3,  true),
    (gen_random_uuid(), v_client_id, 'OTHERS',        'Other Allowances',      'EARNING',   true,  false, true,  false, 4,  true),
    (gen_random_uuid(), v_client_id, 'ATT_BONUS',     'Attendance Bonus',      'EARNING',   true,  false, true,  false, 5,  true),
    (gen_random_uuid(), v_client_id, 'PF_EMP',        'PF (Employee)',         'DEDUCTION', false, false, false, false, 10, true),
    (gen_random_uuid(), v_client_id, 'PF_ER',         'PF (Employer)',         'EMPLOYER',  false, false, false, false, 11, true),
    (gen_random_uuid(), v_client_id, 'ESI_EMP',       'ESI (Employee)',        'DEDUCTION', false, false, false, false, 12, true),
    (gen_random_uuid(), v_client_id, 'ESI_ER',        'ESI (Employer)',        'EMPLOYER',  false, false, false, false, 13, true),
    (gen_random_uuid(), v_client_id, 'PT',            'Professional Tax',      'DEDUCTION', false, false, false, false, 14, true),
    (gen_random_uuid(), v_client_id, 'NET_PAY',       'Net Pay',              'INFO',      false, false, false, false, 99, true);

  -- Look up component IDs for structure items
  SELECT id INTO v_comp_ag  FROM payroll_components WHERE client_id = v_client_id AND code = 'ACTUAL_GROSS';
  SELECT id INTO v_comp_bas FROM payroll_components WHERE client_id = v_client_id AND code = 'BASIC';
  SELECT id INTO v_comp_hra FROM payroll_components WHERE client_id = v_client_id AND code = 'HRA';
  SELECT id INTO v_comp_oth FROM payroll_components WHERE client_id = v_client_id AND code = 'OTHERS';
  SELECT id INTO v_comp_att FROM payroll_components WHERE client_id = v_client_id AND code = 'ATT_BONUS';

  -- ══════════════════════════════════════════════════════════════════════════
  -- C) RULE SET + PARAMETERS
  -- ══════════════════════════════════════════════════════════════════════════
  -- Deactivate any existing rule sets
  UPDATE pay_rule_sets SET is_active = false WHERE client_id = v_client_id;

  v_rs_id := gen_random_uuid();

  INSERT INTO pay_rule_sets (id, client_id, branch_id, name, effective_from, effective_to, is_active)
  VALUES (v_rs_id, v_client_id, NULL, 'Logiq Standard Rules Apr 2026', '2026-04-01', NULL, true);

  -- Minimum wages parameter (Telangana - update every Apr & Oct)
  INSERT INTO pay_rule_parameters (id, rule_set_id, key, value_num, unit, notes)
  VALUES
    (gen_random_uuid(), v_rs_id, 'MIN_WAGES', 15000, 'INR',
     'Telangana minimum wages. Review and update every April and October.');

  -- ══════════════════════════════════════════════════════════════════════════
  -- D) SALARY STRUCTURE + ITEMS
  -- ══════════════════════════════════════════════════════════════════════════
  -- Deactivate any existing structures
  UPDATE pay_salary_structures SET is_active = false WHERE client_id = v_client_id;

  v_struct_id := gen_random_uuid();

  INSERT INTO pay_salary_structures (
    id, client_id, name, scope_type,
    branch_id, department_id, grade_id, employee_id,
    rule_set_id, effective_from, effective_to, is_active
  ) VALUES (
    v_struct_id, v_client_id, 'Logiq Standard Structure', 'TENANT',
    NULL, NULL, NULL, NULL,
    v_rs_id, '2026-04-01', NULL, true
  );

  -- Structure Items (calculation instructions for each component)
  -- Priority order matters: ACTUAL_GROSS → BASIC → HRA → OTHERS → ATT_BONUS
  INSERT INTO pay_salary_structure_items (
    id, structure_id, component_id,
    calc_method, fixed_amount, percentage, percentage_base,
    formula, slab_ref, balancing_config,
    min_amount, max_amount, rounding_mode,
    priority, enabled
  ) VALUES
    -- ACTUAL_GROSS: comes from uploaded input, FIXED placeholder with 0
    (gen_random_uuid(), v_struct_id, v_comp_ag,
     'FIXED', 0, NULL, NULL,
     NULL, NULL, NULL,
     NULL, NULL, 'NO_ROUNDING',
     1, true),

    -- BASIC: 50% of Gross if > 30k, else 15000, if < 15k then = Gross
    --   Floor = MIN_WAGES parameter
    (gen_random_uuid(), v_struct_id, v_comp_bas,
     'FORMULA', NULL, NULL, NULL,
     'MAX(IF(ACTUAL_GROSS < 15000, ACTUAL_GROSS, IF(ACTUAL_GROSS > 30000, ACTUAL_GROSS * 0.50, 15000)), PARAM("MIN_WAGES"))',
     NULL, NULL,
     NULL, NULL, 'NEAREST_RUPEE',
     2, true),

    -- HRA: 50% of Basic if Gross > 30000, else 0
    (gen_random_uuid(), v_struct_id, v_comp_hra,
     'FORMULA', NULL, NULL, NULL,
     'IF(ACTUAL_GROSS > 30000, BASIC * 0.50, 0)',
     NULL, NULL,
     NULL, NULL, 'NEAREST_RUPEE',
     3, true),

    -- OTHERS: remaining balance = Gross - Basic - HRA (min 0)
    (gen_random_uuid(), v_struct_id, v_comp_oth,
     'FORMULA', NULL, NULL, NULL,
     'MAX(ACTUAL_GROSS - BASIC - HRA, 0)',
     NULL, NULL,
     NULL, NULL, 'NEAREST_RUPEE',
     4, true),

    -- ATTENDANCE BONUS: ₹2000 if LOP ≤ 1.5 days
    (gen_random_uuid(), v_struct_id, v_comp_att,
     'FORMULA', NULL, NULL, NULL,
     'IF(LOP_DAYS <= 1.5, 2000, 0)',
     NULL, NULL,
     NULL, NULL, 'NO_ROUNDING',
     5, true);

  -- ══════════════════════════════════════════════════════════════════════════
  -- E) TELANGANA PT SLABS
  -- ══════════════════════════════════════════════════════════════════════════
  -- Clean existing TS PT slabs for this client
  DELETE FROM payroll_statutory_slabs
  WHERE client_id = v_client_id AND state_code = 'TS' AND component_code = 'PT';

  -- Telangana Professional Tax slabs (FY 2025-26 / 2026-27):
  --   Gross ≤  15000  → PT =   0
  --   15001 – 20000   → PT = 150
  --   > 20000         → PT = 200
  -- Note: February PT for > 20000 bracket is ₹300 (annual adjustment)
  INSERT INTO payroll_statutory_slabs (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
  VALUES
    (gen_random_uuid(), v_client_id, 'TS', 'PT', 0,     15000, 0,   NOW()),
    (gen_random_uuid(), v_client_id, 'TS', 'PT', 15001, 20000, 150, NOW()),
    (gen_random_uuid(), v_client_id, 'TS', 'PT', 20001, NULL,  200, NOW());

  RAISE NOTICE 'Logiq payroll configuration complete.';
  RAISE NOTICE '  Rule Set: %', v_rs_id;
  RAISE NOTICE '  Structure: %', v_struct_id;
  RAISE NOTICE '  Components: ACTUAL_GROSS=%, BASIC=%, HRA=%, OTHERS=%, ATT_BONUS=%',
    v_comp_ag, v_comp_bas, v_comp_hra, v_comp_oth, v_comp_att;

END $$;
