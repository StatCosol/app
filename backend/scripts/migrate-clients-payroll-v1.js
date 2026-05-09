/* eslint-disable */
// Backfill standard payroll engine config (client setup, components, rule set,
// salary structure with 5 standard items) for every active client that does
// not already have an active APPROVED salary structure.
//
// Idempotent: skips clients with an active APPROVED structure; reuses existing
// payroll_components / pay_rule_sets where present (without disturbing them).
//
// New structures are auto-marked APPROVED by the CCO (compliance@statcosol.com)
// so the engine can immediately consume them.
//
// Usage:
//   $env:PGPASSWORD = '<db pwd>'
//   node scripts/migrate-clients-payroll-v1.js [--dry-run] [--client <CODE>]

const { Client } = require('pg');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const ONLY = args.includes('--client') ? args[args.indexOf('--client') + 1] : null;

const STANDARD_COMPONENTS = [
  ['ACTUAL_GROSS',     'Actual Gross',            'INFO',      false, false, false, true,  1],
  ['BASIC',            'Basic Salary',            'EARNING',   true,  true,  true,  true,  2],
  ['HRA',              'House Rent Allowance',    'EARNING',   false, false, true,  false, 3],
  ['OTHERS',           'Other Allowances',        'EARNING',   true,  false, true,  false, 4],
  ['ATT_BONUS',        'Attendance Bonus',        'EARNING',   true,  false, false, false, 5],
  ['OTHER_EARNINGS',   'Other Earnings',          'EARNING',   true,  false, true,  false, 6],
  ['ARREAR_ATT_BONUS', 'Arrear Attendance Bonus', 'EARNING',   true,  false, false, false, 7],
  ['PF_EMP',           'PF (Employee)',           'DEDUCTION', false, false, false, false, 10],
  ['PF_ER',            'PF (Employer)',           'EMPLOYER',  false, false, false, false, 11],
  ['ESI_EMP',          'ESI (Employee)',          'DEDUCTION', false, false, false, false, 12],
  ['ESI_ER',           'ESI (Employer)',          'EMPLOYER',  false, false, false, false, 13],
  ['PT',               'Professional Tax',        'DEDUCTION', false, false, false, false, 14],
  ['NET_PAY',          'Net Pay',                 'INFO',      false, false, false, false, 99],
];

const STRUCTURE_ITEMS = [
  // [code, calc_method, fixed_amount, formula, rounding_mode, priority]
  ['ACTUAL_GROSS', 'FIXED',   0,    null,                                                                                                'NO_ROUNDING',    1],
  ['BASIC',        'FORMULA', null, 'IF(ACTUAL_GROSS <= 15000, ACTUAL_GROSS, IF(ACTUAL_GROSS > 30000, ACTUAL_GROSS * 0.50, 15000))',     'NEAREST_RUPEE',  2],
  ['HRA',          'FORMULA', null, 'IF(ACTUAL_GROSS > 30000, BASIC * 0.40, 0)',                                                          'NEAREST_RUPEE',  3],
  ['OTHERS',       'FORMULA', null, 'MAX(ACTUAL_GROSS - BASIC - HRA, 0)',                                                                 'NEAREST_RUPEE',  4],
  ['ATT_BONUS',    'FORMULA', null, 'IF(ACTUAL_GROSS <= 25000, IF(WORKED_DAYS >= 24.5, 2000, 0), 0)',                                     'NO_ROUNDING',    5],
];

(async () => {
  const c = new Client({
    host: 'statcompy-db.postgres.database.azure.com',
    user: 'Statcocompy',
    password: process.env.PGPASSWORD,
    database: 'statcompy',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  console.log(`Connected.${DRY ? ' [DRY-RUN]' : ''}${ONLY ? ` [client=${ONLY}]` : ''}`);

  // 1. Find approver (CCO)
  const cco = await c.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
     WHERE lower(u.email) = 'compliance@statcosol.com' AND r.code = 'CCO' LIMIT 1`,
  );
  if (!cco.rows.length) throw new Error('CCO approver compliance@statcosol.com not found');
  const ccoId = cco.rows[0].id;
  console.log(`Approver (CCO) id: ${ccoId}`);

  // 2. Candidate clients
  const where = ONLY ? `AND cl.client_code = $1` : ``;
  const params = ONLY ? [ONLY] : [];
  const { rows: clients } = await c.query(
    `SELECT cl.id, cl.client_code, cl.client_name
       FROM clients cl
      WHERE (cl.is_active = true OR cl.is_active IS NULL)
        ${where}
        AND NOT EXISTS (
          SELECT 1 FROM pay_salary_structures s
           WHERE s.client_id = cl.id
             AND s.is_active = true
             AND s.approval_status = 'APPROVED'
        )
      ORDER BY cl.client_code NULLS LAST, cl.client_name`,
    params,
  );
  console.log(`Candidates: ${clients.length}`);
  if (!clients.length) { await c.end(); return; }

  for (const cl of clients) {
    const cid = cl.id;
    console.log(`\n→ ${cl.client_code || '(no code)'} | ${cl.client_name} (${cid})`);

    if (DRY) { console.log('   [dry-run] would seed setup + components + rule set + structure'); continue; }

    await c.query('BEGIN');
    try {
      // 2a. payroll_client_setup (upsert defaults)
      await c.query(
        `INSERT INTO payroll_client_setup (
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
           15000, 21000, 21000,
           'CALENDAR_DAYS', 1.00
         )
         ON CONFLICT (client_id) DO NOTHING`,
        [cid],
      );

      // 2b. components (insert any missing of the 13 standard ones)
      for (const [code, name, type, taxable, affectsPf, affectsEsi, required, order] of STANDARD_COMPONENTS) {
        await c.query(
          `INSERT INTO payroll_components
             (id, client_id, code, name, component_type, is_taxable,
              affects_pf_wage, affects_esi_wage, is_required, display_order, is_active)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, true)
           ON CONFLICT (client_id, code) DO NOTHING`,
          [cid, code, name, type, taxable, affectsPf, affectsEsi, required, order],
        );
      }

      // 2c. rule set with MIN_WAGES (reuse active if present, else create)
      let rsId;
      const { rows: rsExisting } = await c.query(
        `SELECT id FROM pay_rule_sets WHERE client_id = $1 AND is_active = true LIMIT 1`,
        [cid],
      );
      if (rsExisting.length) {
        rsId = rsExisting[0].id;
      } else {
        const { rows: rsNew } = await c.query(
          `INSERT INTO pay_rule_sets (id, client_id, branch_id, name, effective_from, effective_to, is_active)
           VALUES (gen_random_uuid(), $1, NULL, 'Standard Rules', '2026-01-01', NULL, true)
           RETURNING id`,
          [cid],
        );
        rsId = rsNew[0].id;
        await c.query(
          `INSERT INTO pay_rule_parameters (id, rule_set_id, key, value_num, unit, notes)
           VALUES (gen_random_uuid(), $1, 'MIN_WAGES', 15000, 'INR', 'Minimum wages')`,
          [rsId],
        );
      }

      // 2d. component id lookup
      const compMap = {};
      for (const [code] of STANDARD_COMPONENTS) {
        const { rows } = await c.query(
          `SELECT id FROM payroll_components WHERE client_id = $1 AND code = $2`,
          [cid, code],
        );
        if (!rows.length) throw new Error(`component ${code} missing after upsert for ${cl.client_code}`);
        compMap[code] = rows[0].id;
      }

      // 2e. salary structure (deactivate old, create new APPROVED)
      await c.query(
        `UPDATE pay_salary_structures SET is_active = false WHERE client_id = $1 AND is_active = true`,
        [cid],
      );
      const { rows: sNew } = await c.query(
        `INSERT INTO pay_salary_structures
           (id, client_id, name, scope_type,
            branch_id, department_id, grade_id, employee_id,
            rule_set_id, effective_from, effective_to, is_active,
            approval_status, submitted_by_id, submitted_at,
            approved_by_id, approved_at)
         VALUES (gen_random_uuid(), $1, 'Standard Structure', 'TENANT',
                 NULL, NULL, NULL, NULL,
                 $2, '2026-01-01', NULL, true,
                 'APPROVED', $3, now(),
                 $3, now())
         RETURNING id`,
        [cid, rsId, ccoId],
      );
      const stId = sNew[0].id;

      // 2f. structure items
      for (const [code, calcMethod, fixedAmount, formula, rounding, priority] of STRUCTURE_ITEMS) {
        await c.query(
          `INSERT INTO pay_salary_structure_items
             (id, structure_id, component_id, calc_method,
              fixed_amount, percentage, percentage_base,
              formula, slab_ref, balancing_config,
              min_amount, max_amount, rounding_mode, priority, enabled)
           VALUES (gen_random_uuid(), $1, $2, $3,
                   $4, NULL, NULL,
                   $5, NULL, NULL,
                   NULL, NULL, $6, $7, true)`,
          [stId, compMap[code], calcMethod, fixedAmount, formula, rounding, priority],
        );
      }

      await c.query('COMMIT');
      console.log(`   ✓ structure ${stId} APPROVED with ${STRUCTURE_ITEMS.length} items`);
    } catch (e) {
      await c.query('ROLLBACK');
      console.error(`   ✗ ${cl.client_code}: ${e.message}`);
    }
  }

  // 3. Final report
  const { rows: report } = await c.query(`
    SELECT cl.client_code, cl.client_name,
           COUNT(s.id) FILTER (WHERE s.is_active AND s.approval_status='APPROVED') AS active_approved,
           COUNT(s.id) AS total_structures
    FROM clients cl
    LEFT JOIN pay_salary_structures s ON s.client_id = cl.id
    WHERE cl.is_active = true OR cl.is_active IS NULL
    GROUP BY cl.client_code, cl.client_name
    ORDER BY cl.client_code NULLS LAST
  `);
  console.log('\nFinal state:');
  console.table(report);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
