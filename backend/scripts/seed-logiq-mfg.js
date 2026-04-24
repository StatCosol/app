// Seed payroll config for Logiq Mfg Services Pvt Ltd (LMSPL)
// Run: node scripts/seed-logiq-mfg.js
const { Client } = require('pg');

const client = new Client({
  host: 'statcompy-db.postgres.database.azure.com',
  port: 5432,
  user: 'Statcocompy',
  password: 'Statco@123',
  database: 'statcompy',
  ssl: { rejectUnauthorized: false },
});

async function run() {
  await client.connect();
  console.log('Connected to DB');

  // Find client ID
  const { rows: clientRows } = await client.query(
    `SELECT id, name FROM clients WHERE short_code = 'LMSPL' LIMIT 1`
  );
  if (!clientRows.length) throw new Error('Client LMSPL not found');
  const cid = clientRows[0].id;
  console.log(`Found client: ${clientRows[0].name} (${cid})`);

  await client.query('BEGIN');
  try {
    // 1. Statutory setup
    await client.query(`
      INSERT INTO payroll_client_setup (
        id, client_id,
        pf_enabled, esi_enabled, pt_enabled, lwf_enabled,
        pf_employer_rate, pf_employee_rate,
        esi_employer_rate, esi_employee_rate,
        pf_wage_ceiling, esi_wage_ceiling,
        pf_gross_threshold
      ) VALUES (
        gen_random_uuid(), $1,
        true, true, true, false,
        13.00, 12.00, 3.25, 0.75,
        15000, 21000,
        25000
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
        pf_gross_threshold = 25000
    `, [cid]);
    console.log('✓ Statutory setup upserted (PF threshold = 25000)');

    // 2. Components (fresh)
    await client.query(
      `DELETE FROM payroll_component_rules WHERE component_id IN (SELECT id FROM payroll_components WHERE client_id = $1)`,
      [cid]
    );
    await client.query(`DELETE FROM payroll_components WHERE client_id = $1`, [cid]);

    await client.query(`
      INSERT INTO payroll_components (id, client_id, code, name, component_type, is_taxable, affects_pf_wage, affects_esi_wage, is_required, display_order, is_active) VALUES
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
    `, [cid]);
    console.log('✓ Payroll components inserted');

    const compAg  = (await client.query(`SELECT id FROM payroll_components WHERE client_id=$1 AND code='ACTUAL_GROSS'`, [cid])).rows[0].id;
    const compBas = (await client.query(`SELECT id FROM payroll_components WHERE client_id=$1 AND code='BASIC'`, [cid])).rows[0].id;
    const compHra = (await client.query(`SELECT id FROM payroll_components WHERE client_id=$1 AND code='HRA'`, [cid])).rows[0].id;
    const compOth = (await client.query(`SELECT id FROM payroll_components WHERE client_id=$1 AND code='OTHERS'`, [cid])).rows[0].id;
    const compAtt = (await client.query(`SELECT id FROM payroll_components WHERE client_id=$1 AND code='ATT_BONUS'`, [cid])).rows[0].id;

    // 3. Rule Set
    await client.query(`UPDATE pay_rule_sets SET is_active = false WHERE client_id = $1`, [cid]);
    const rsId = (await client.query(
      `INSERT INTO pay_rule_sets (id, client_id, branch_id, name, effective_from, effective_to, is_active)
       VALUES (gen_random_uuid(), $1, NULL, 'Standard Rules', '2026-01-01', NULL, true) RETURNING id`,
      [cid]
    )).rows[0].id;
    await client.query(
      `INSERT INTO pay_rule_parameters (id, rule_set_id, key, value_num, unit, notes)
       VALUES (gen_random_uuid(), $1, 'MIN_WAGES', 15000, 'INR', 'Minimum wages')`,
      [rsId]
    );
    console.log(`✓ Rule set created (${rsId})`);

    // 4. Structure — use LEGACY_TENANT_1 if exists, else create
    await client.query(`UPDATE pay_salary_structures SET is_active = false WHERE client_id = $1`, [cid]);

    let stId;
    const existing = await client.query(
      `SELECT id FROM pay_salary_structures WHERE client_id=$1 AND code='LEGACY_TENANT_1'`, [cid]
    );
    if (existing.rows.length) {
      stId = existing.rows[0].id;
      await client.query(
        `UPDATE pay_salary_structures SET is_active=true, rule_set_id=$1 WHERE id=$2`,
        [rsId, stId]
      );
      console.log(`✓ Reusing existing LEGACY_TENANT_1 structure (${stId})`);
    } else {
      stId = (await client.query(
        `INSERT INTO pay_salary_structures (id, client_id, code, name, scope_type, branch_id, department_id, grade_id, employee_id, rule_set_id, effective_from, effective_to, is_active)
         VALUES (gen_random_uuid(), $1, 'LEGACY_TENANT_1', 'Standard Structure', 'TENANT', NULL, NULL, NULL, NULL, $2, '2026-01-01', NULL, true) RETURNING id`,
        [cid, rsId]
      )).rows[0].id;
      console.log(`✓ New LEGACY_TENANT_1 structure created (${stId})`);
    }

    // 5. Structure items
    await client.query(`DELETE FROM pay_salary_structure_items WHERE structure_id = $1`, [stId]);
    await client.query(`
      INSERT INTO pay_salary_structure_items (id, structure_id, component_id, calc_method, fixed_amount, formula, rounding_mode, priority, enabled) VALUES
        (gen_random_uuid(), $1, $2, 'FIXED',   0,    NULL, 'NO_ROUNDING',    1, true),
        (gen_random_uuid(), $1, $3, 'FORMULA', NULL, 'IF(ACTUAL_GROSS <= 15000, ACTUAL_GROSS, IF(ACTUAL_GROSS > 30000, ACTUAL_GROSS * 0.50, 15000))', 'NEAREST_RUPEE', 2, true),
        (gen_random_uuid(), $1, $4, 'FORMULA', NULL, 'IF(ACTUAL_GROSS > 30000, BASIC * 0.40, 0)', 'NEAREST_RUPEE', 3, true),
        (gen_random_uuid(), $1, $5, 'FORMULA', NULL, 'MAX(ACTUAL_GROSS - BASIC - HRA, 0)',         'NEAREST_RUPEE', 4, true),
        (gen_random_uuid(), $1, $6, 'FORMULA', NULL, 'IF(ACTUAL_GROSS <= 25000, IF(WORKED_DAYS >= 24.5, 2000, 0), 0)', 'NO_ROUNDING', 5, true)
    `, [stId, compAg, compBas, compHra, compOth, compAtt]);
    console.log('✓ Structure items inserted (5 components)');

    // 6. PT Slabs (Telangana)
    await client.query(
      `DELETE FROM payroll_statutory_slabs WHERE client_id=$1 AND state_code='TS' AND component_code='PT'`,
      [cid]
    );
    await client.query(`
      INSERT INTO payroll_statutory_slabs (id, client_id, state_code, component_code, from_amount, to_amount, value_amount, created_at) VALUES
        (gen_random_uuid(), $1, 'TS', 'PT',     0, 15000,  0,   NOW()),
        (gen_random_uuid(), $1, 'TS', 'PT', 15001, 20000, 150,  NOW()),
        (gen_random_uuid(), $1, 'TS', 'PT', 20001,  NULL, 200,  NOW())
    `, [cid]);
    console.log('✓ PT slabs inserted (Telangana)');

    await client.query('COMMIT');
    console.log('\n✅ All done. Logiq Mfg payroll config seeded successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error, rolled back:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run().catch((err) => { console.error(err); process.exit(1); });
