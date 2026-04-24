-- Seed payroll components + structure items for Logiq Mfg Services Pvt Ltd (LMSPL)
-- PF Gross Threshold = 25000 (both employee & employer PF deducted for gross >= 25000)
-- Run once against the production DB.

DO $$
DECLARE
  v_cid      uuid;
  v_st_id    uuid;
  v_rs_id    uuid;
  v_comp_ag  uuid;
  v_comp_bas uuid;
  v_comp_hra uuid;
  v_comp_oth uuid;
  v_comp_att uuid;
BEGIN
  -- Resolve client ID for LMSPL
  SELECT id INTO v_cid FROM clients WHERE short_code = 'LMSPL' LIMIT 1;
  IF v_cid IS NULL THEN
    RAISE EXCEPTION 'Client LMSPL not found';
  END IF;
  RAISE NOTICE 'Client ID: %', v_cid;

  -- ── 1. Statutory Setup (upsert) ─────────────────────────────────────────
  INSERT INTO payroll_client_setup (
    id, client_id,
    pf_enabled, esi_enabled, pt_enabled, lwf_enabled,
    pf_employer_rate, pf_employee_rate,
    esi_employer_rate, esi_employee_rate,
    pf_wage_ceiling, esi_wage_ceiling,
    pf_gross_threshold
  )
  VALUES (
    gen_random_uuid(), v_cid,
    true, true, true, false,
    13.00, 12.00,
    3.25, 0.75,
    15000, 21000,
    25000   -- PF applies only for gross >= 25000
  )
  ON CONFLICT (client_id) DO UPDATE SET
    pf_enabled         = true,
    esi_enabled        = true,
    pt_enabled         = true,
    pf_employer_rate   = 13.00,
    pf_employee_rate   = 12.00,
    esi_employer_rate  = 3.25,
    esi_employee_rate  = 0.75,
    pf_wage_ceiling    = 15000,
    esi_wage_ceiling   = 21000,
    pf_gross_threshold = 25000;

  -- ── 2. Payroll Components (fresh) ──────────────────────────────────────
  DELETE FROM payroll_component_rules WHERE component_id IN (
    SELECT id FROM payroll_components WHERE client_id = v_cid
  );
  DELETE FROM payroll_components WHERE client_id = v_cid;

  INSERT INTO payroll_components (id, client_id, code, name, component_type, is_taxable, affects_pf_wage, affects_esi_wage, is_required, display_order, is_active) VALUES
    (gen_random_uuid(), v_cid, 'ACTUAL_GROSS',      'Actual Gross',              'INFO',      false, false, false, true,  1,  true),
    (gen_random_uuid(), v_cid, 'BASIC',             'Basic Salary',              'EARNING',   true,  true,  true,  true,  2,  true),
    (gen_random_uuid(), v_cid, 'HRA',               'House Rent Allowance',      'EARNING',   false, false, true,  false, 3,  true),
    (gen_random_uuid(), v_cid, 'OTHERS',            'Other Allowances',          'EARNING',   true,  false, true,  false, 4,  true),
    (gen_random_uuid(), v_cid, 'ATT_BONUS',         'Attendance Bonus',          'EARNING',   true,  false, false, false, 5,  true),
    (gen_random_uuid(), v_cid, 'OTHER_EARNINGS',    'Other Earnings',            'EARNING',   true,  false, true,  false, 6,  true),
    (gen_random_uuid(), v_cid, 'ARREAR_ATT_BONUS',  'Arrear Attendance Bonus',   'EARNING',   true,  false, false, false, 7,  true),
    (gen_random_uuid(), v_cid, 'PF_EMP',            'PF (Employee)',             'DEDUCTION', false, false, false, false, 10, true),
    (gen_random_uuid(), v_cid, 'PF_ER',             'PF (Employer)',             'EMPLOYER',  false, false, false, false, 11, true),
    (gen_random_uuid(), v_cid, 'ESI_EMP',           'ESI (Employee)',            'DEDUCTION', false, false, false, false, 12, true),
    (gen_random_uuid(), v_cid, 'ESI_ER',            'ESI (Employer)',            'EMPLOYER',  false, false, false, false, 13, true),
    (gen_random_uuid(), v_cid, 'PT',                'Professional Tax',          'DEDUCTION', false, false, false, false, 14, true),
    (gen_random_uuid(), v_cid, 'NET_PAY',           'Net Pay',                   'INFO',      false, false, false, false, 99, true);

  SELECT id INTO v_comp_ag  FROM payroll_components WHERE client_id = v_cid AND code = 'ACTUAL_GROSS';
  SELECT id INTO v_comp_bas FROM payroll_components WHERE client_id = v_cid AND code = 'BASIC';
  SELECT id INTO v_comp_hra FROM payroll_components WHERE client_id = v_cid AND code = 'HRA';
  SELECT id INTO v_comp_oth FROM payroll_components WHERE client_id = v_cid AND code = 'OTHERS';
  SELECT id INTO v_comp_att FROM payroll_components WHERE client_id = v_cid AND code = 'ATT_BONUS';

  -- ── 3. Rule Set ────────────────────────────────────────────────────────
  UPDATE pay_rule_sets SET is_active = false WHERE client_id = v_cid;
  v_rs_id := gen_random_uuid();
  INSERT INTO pay_rule_sets (id, client_id, branch_id, name, effective_from, effective_to, is_active)
  VALUES (v_rs_id, v_cid, NULL, 'Standard Rules', '2026-01-01', NULL, true);

  INSERT INTO pay_rule_parameters (id, rule_set_id, key, value_num, unit, notes)
  VALUES (gen_random_uuid(), v_rs_id, 'MIN_WAGES', 15000, 'INR', 'Minimum wages');

  -- ── 4. Salary Structure – populate the existing LEGACY_TENANT_1 ────────
  -- Deactivate any other structures, activate LEGACY_TENANT_1
  UPDATE pay_salary_structures SET is_active = false WHERE client_id = v_cid;
  UPDATE pay_salary_structures SET is_active = true, rule_set_id = v_rs_id
  WHERE client_id = v_cid AND code = 'LEGACY_TENANT_1';

  SELECT id INTO v_st_id
  FROM pay_salary_structures
  WHERE client_id = v_cid AND code = 'LEGACY_TENANT_1';

  IF v_st_id IS NULL THEN
    -- Fallback: create a new structure if LEGACY_TENANT_1 doesn't exist
    v_st_id := gen_random_uuid();
    INSERT INTO pay_salary_structures (id, client_id, code, name, scope_type, branch_id, department_id, grade_id, employee_id, rule_set_id, effective_from, effective_to, is_active)
    VALUES (v_st_id, v_cid, 'LEGACY_TENANT_1', 'Standard Structure', 'TENANT', NULL, NULL, NULL, NULL, v_rs_id, '2026-01-01', NULL, true);
  END IF;

  -- Remove existing items and re-add
  DELETE FROM pay_salary_structure_items WHERE structure_id = v_st_id;

  INSERT INTO pay_salary_structure_items (id, structure_id, component_id, calc_method, fixed_amount, percentage, percentage_base, formula, slab_ref, balancing_config, min_amount, max_amount, rounding_mode, priority, enabled) VALUES
    (gen_random_uuid(), v_st_id, v_comp_ag,  'FIXED',   0,    NULL, NULL,
     NULL, NULL, NULL, NULL, NULL, 'NO_ROUNDING',    1, true),
    (gen_random_uuid(), v_st_id, v_comp_bas, 'FORMULA', NULL, NULL, NULL,
     'IF(ACTUAL_GROSS <= 15000, ACTUAL_GROSS, IF(ACTUAL_GROSS > 30000, ACTUAL_GROSS * 0.50, 15000))',
     NULL, NULL, NULL, NULL, 'NEAREST_RUPEE', 2, true),
    (gen_random_uuid(), v_st_id, v_comp_hra, 'FORMULA', NULL, NULL, NULL,
     'IF(ACTUAL_GROSS > 30000, BASIC * 0.40, 0)',
     NULL, NULL, NULL, NULL, 'NEAREST_RUPEE', 3, true),
    (gen_random_uuid(), v_st_id, v_comp_oth, 'FORMULA', NULL, NULL, NULL,
     'MAX(ACTUAL_GROSS - BASIC - HRA, 0)',
     NULL, NULL, NULL, NULL, 'NEAREST_RUPEE', 4, true),
    (gen_random_uuid(), v_st_id, v_comp_att, 'FORMULA', NULL, NULL, NULL,
     'IF(ACTUAL_GROSS <= 25000, IF(WORKED_DAYS >= 24.5, 2000, 0), 0)',
     NULL, NULL, NULL, NULL, 'NO_ROUNDING',   5, true);

  -- ── 5. PT Slabs (Telangana) ───────────────────────────────────────────
  DELETE FROM payroll_statutory_slabs
  WHERE client_id = v_cid AND state_code = 'TS' AND component_code = 'PT';

  INSERT INTO payroll_statutory_slabs (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at) VALUES
    (gen_random_uuid(), v_cid, 'TS', 'PT',     0, 15000, 0,   NOW()),
    (gen_random_uuid(), v_cid, 'TS', 'PT', 15001, 20000, 150, NOW()),
    (gen_random_uuid(), v_cid, 'TS', 'PT', 20001,  NULL, 200, NOW());

  RAISE NOTICE 'Done. Logiq Mfg payroll config seeded with PF threshold = 25000';
END $$;
