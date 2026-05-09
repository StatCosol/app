/* eslint-disable */
// Seed VEIPL payroll setup mirroring LMSPL, with:
//   - wage_basis_days = CALENDAR_DAYS
//   - ot_multiplier   = 1.00 (single wage)
//   - PF / ESI: no wage ceiling for this client; employer pays full ER PF/ESI;
//     employee pays full EE PF/ESI on uncapped wage.
//   - No attendance bonus.
//   - Leave policies  : PL = 18, SL = 6 (annual)
//
// Usage:
//   $env:PGPASSWORD = (az containerapp secret show -n statcompy-backend -g statcompy-rg --secret-name db-pass --query "value" -o tsv);
//   node scripts/seed-veipl-payroll.js

const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: 'statcompy-db.postgres.database.azure.com',
    user: 'Statcocompy',
    password: process.env.PGPASSWORD,
    database: 'statcompy',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  console.log('Connected.');

  const { rows: cr } = await c.query(
    `SELECT id, client_name FROM clients WHERE client_code = 'VEIPL' LIMIT 1`,
  );
  if (!cr.length) throw new Error('Client VEIPL not found');
  const cid = cr[0].id;
  console.log(`VEIPL: ${cr[0].client_name} (${cid})`);

  await c.query('BEGIN');
  try {
    // 1. Statutory + wage/OT setup
    //    PF: capped at statutory ceiling 15000 (Math.min(pfWage, 15000)).
    //    ESI: esi_wage_ceiling set to a very large value so ESI applies on uncapped wage.
    //    pf_gross_threshold set very high so PF_ER_FROM_EMP (employer share recovered
    //    from employee) never triggers — employer pays own ER share, employee pays own EE.
    await c.query(
      `
      INSERT INTO payroll_client_setup (
        id, client_id,
        pf_enabled, esi_enabled, pt_enabled, lwf_enabled,
        pf_employer_rate, pf_employee_rate,
        esi_employer_rate, esi_employee_rate,
        pf_wage_ceiling, esi_wage_ceiling, pf_gross_threshold,
        wage_basis_days, ot_multiplier
      ) VALUES (
        gen_random_uuid(), $1,
        true, true, true, false,
        13.00, 12.00, 3.25, 0.75,
        15000, 99999999, 99999999,
        'CALENDAR_DAYS', 1.00
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
        esi_wage_ceiling   = 99999999,
        pf_gross_threshold = 99999999,
        wage_basis_days    = 'CALENDAR_DAYS',
        ot_multiplier      = 1.00
    `,
      [cid],
    );
    console.log('  ✓ payroll_client_setup (CALENDAR_DAYS, OT x1, PF cap 15000, ESI no ceiling)');

    // 2. Components (fresh) — same set as LMSPL
    await c.query(
      `DELETE FROM payroll_component_rules WHERE component_id IN
         (SELECT id FROM payroll_components WHERE client_id = $1)`,
      [cid],
    );
    await c.query(`DELETE FROM payroll_components WHERE client_id = $1`, [cid]);

    await c.query(
      `
      INSERT INTO payroll_components
        (id, client_id, code, name, component_type, is_taxable,
         affects_pf_wage, affects_esi_wage, is_required, display_order, is_active)
      VALUES
        (gen_random_uuid(), $1, 'ACTUAL_GROSS',     'Actual Gross',            'INFO',      false, false, false, true,  1,  true),
        (gen_random_uuid(), $1, 'BASIC',            'Basic Salary',            'EARNING',   true,  true,  true,  true,  2,  true),
        (gen_random_uuid(), $1, 'HRA',              'House Rent Allowance',    'EARNING',   false, false, true,  false, 3,  true),
        (gen_random_uuid(), $1, 'OTHERS',           'Other Allowances',        'EARNING',   true,  false, true,  false, 4,  true),
        (gen_random_uuid(), $1, 'ATT_BONUS',        'Attendance Bonus',        'EARNING',   true,  false, false, false, 5,  true),
        (gen_random_uuid(), $1, 'OTHER_EARNINGS',   'Other Earnings',          'EARNING',   true,  false, true,  false, 6,  true),
        (gen_random_uuid(), $1, 'ARREAR_ATT_BONUS', 'Arrear Attendance Bonus', 'EARNING',   true,  false, false, false, 7,  true),
        (gen_random_uuid(), $1, 'PF_EMP',           'PF (Employee)',           'DEDUCTION', false, false, false, false, 10, true),
        (gen_random_uuid(), $1, 'PF_ER',            'PF (Employer)',           'EMPLOYER',  false, false, false, false, 11, true),
        (gen_random_uuid(), $1, 'ESI_EMP',          'ESI (Employee)',          'DEDUCTION', false, false, false, false, 12, true),
        (gen_random_uuid(), $1, 'ESI_ER',           'ESI (Employer)',          'EMPLOYER',  false, false, false, false, 13, true),
        (gen_random_uuid(), $1, 'PT',               'Professional Tax',        'DEDUCTION', false, false, false, false, 14, true),
        (gen_random_uuid(), $1, 'NET_PAY',          'Net Pay',                 'INFO',      false, false, false, false, 99, true)
    `,
      [cid],
    );
    console.log('  ✓ payroll_components');

    const compId = async (code) => {
      const r = await c.query(
        `SELECT id FROM payroll_components WHERE client_id = $1 AND code = $2`,
        [cid, code],
      );
      return r.rows[0].id;
    };
    const cAg = await compId('ACTUAL_GROSS');
    const cBas = await compId('BASIC');
    const cHra = await compId('HRA');
    const cOth = await compId('OTHERS');
    const cAtt = await compId('ATT_BONUS');

    // 3. Rule set with MIN_WAGES
    await c.query(`UPDATE pay_rule_sets SET is_active = false WHERE client_id = $1`, [cid]);
    const { rows: rsRows } = await c.query(
      `INSERT INTO pay_rule_sets (id, client_id, branch_id, name, effective_from, effective_to, is_active)
       VALUES (gen_random_uuid(), $1, NULL, 'Standard Rules', '2026-01-01', NULL, true)
       RETURNING id`,
      [cid],
    );
    const rsId = rsRows[0].id;
    await c.query(
      `INSERT INTO pay_rule_parameters (id, rule_set_id, key, value_num, unit, notes)
       VALUES (gen_random_uuid(), $1, 'MIN_WAGES', 15000, 'INR', 'Minimum wages')`,
      [rsId],
    );
    console.log('  ✓ rule set + MIN_WAGES=15000');

    // 4. Salary structure (mirror LMSPL formulas)
    await c.query(
      `UPDATE pay_salary_structures SET is_active = false WHERE client_id = $1`,
      [cid],
    );

    let stId;
    const { rows: stExist } = await c.query(
      `SELECT id FROM pay_salary_structures WHERE client_id = $1 AND name = 'Standard Structure' LIMIT 1`,
      [cid],
    );
    if (stExist.length) {
      stId = stExist[0].id;
      await c.query(
        `UPDATE pay_salary_structures SET is_active = true, rule_set_id = $1 WHERE id = $2`,
        [rsId, stId],
      );
    } else {
      const { rows: stNew } = await c.query(
        `INSERT INTO pay_salary_structures
           (id, client_id, name, scope_type, branch_id, department_id, grade_id, employee_id,
            rule_set_id, effective_from, effective_to, is_active)
         VALUES (gen_random_uuid(), $1, 'Standard Structure',
                 'TENANT', NULL, NULL, NULL, NULL, $2, '2026-01-01', NULL, true)
         RETURNING id`,
        [cid, rsId],
      );
      stId = stNew[0].id;
    }

    await c.query(`DELETE FROM pay_salary_structure_items WHERE structure_id = $1`, [stId]);

    const items = [
      [cAg,  'FIXED',   null, null, null, null, null, null, null, null, 'NO_ROUNDING',    1],
      [cBas, 'FORMULA', null, null, null,
        'IF(ACTUAL_GROSS <= 15000, ACTUAL_GROSS, IF(ACTUAL_GROSS > 30000, ACTUAL_GROSS * 0.50, 15000))',
        null, null, null, null, 'NEAREST_RUPEE', 2],
      [cHra, 'FORMULA', null, null, null,
        'IF(ACTUAL_GROSS > 30000, BASIC * 0.40, 0)',
        null, null, null, null, 'NEAREST_RUPEE', 3],
      [cOth, 'FORMULA', null, null, null,
        'MAX(ACTUAL_GROSS - BASIC - HRA, 0)',
        null, null, null, null, 'NEAREST_RUPEE', 4],
      // No attendance bonus for VEIPL: ATT_BONUS forced to 0
      [cAtt, 'FORMULA', null, null, null,
        '0',
        null, null, null, null, 'NO_ROUNDING',   5],
    ];
    for (const it of items) {
      await c.query(
        `INSERT INTO pay_salary_structure_items
           (id, structure_id, component_id, calc_method, fixed_amount, percentage,
            percentage_base, formula, slab_ref, balancing_config, min_amount, max_amount,
            rounding_mode, priority, enabled)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true)`,
        [stId, ...it],
      );
    }
    console.log('  ✓ salary structure items (BASIC formula = LMSPL)');

    // 5. PT slabs (Telangana)
    await c.query(
      `DELETE FROM payroll_statutory_slabs
       WHERE client_id = $1 AND state_code = 'TS' AND component_code = 'PT'`,
      [cid],
    );
    await c.query(
      `INSERT INTO payroll_statutory_slabs
         (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at)
       VALUES
         (gen_random_uuid(), $1, 'TS', 'PT',     0, 15000, 0,   NOW()),
         (gen_random_uuid(), $1, 'TS', 'PT', 15001, 20000, 150, NOW()),
         (gen_random_uuid(), $1, 'TS', 'PT', 20001,  NULL, 200, NOW())`,
      [cid],
    );
    console.log('  ✓ PT slabs (TS)');

    // 6. Leave policies: PL=18, SL=6 (annual)
    await c.query(
      `DELETE FROM leave_policies WHERE client_id = $1 AND leave_type IN ('PL','SL')`,
      [cid],
    );
    await c.query(
      `INSERT INTO leave_policies
         (id, client_id, branch_id, leave_type, leave_name, accrual_method, accrual_rate,
          carry_forward_limit, yearly_limit, allow_negative, min_notice_days,
          max_days_per_request, requires_document, is_active)
       VALUES
         (gen_random_uuid(), $1, NULL, 'PL', 'Privilege Leave', 'ANNUAL', 0, 0, 18, false, 0, 0, false, true),
         (gen_random_uuid(), $1, NULL, 'SL', 'Sick Leave',      'ANNUAL', 0, 0,  6, false, 0, 0, false, true)`,
      [cid],
    );
    console.log('  ✓ leave_policies PL=18, SL=6');

    await c.query('COMMIT');
    console.log('\nVEIPL payroll setup seeded successfully.');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    await c.end();
  }
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
