-- =============================================================
-- Seed applicability engine master data
-- Thresholds, compliance masters, rules, then link to DEFAULT_INDIA package
-- =============================================================

-- ─── Thresholds ──────────────────────────────────────────────

INSERT INTO threshold_master (code, description, value_number, state_code, effective_from) VALUES
  ('PF_COVERAGE_THRESHOLD',        'EPF applicability headcount',           20,   NULL, '2020-01-01'),
  ('ESIC_WAGE_CEILING',            'ESIC wage ceiling (INR)',           21000,   NULL, '2020-01-01'),
  ('ESIC_COVERAGE_THRESHOLD',      'ESIC applicability headcount',         10,   NULL, '2020-01-01'),
  ('GRATUITY_SERVICE_YEARS',       'Gratuity qualifying years',             5,   NULL, '2020-01-01'),
  ('CLRA_THRESHOLD',               'CLRA applicability headcount',         20,   NULL, '2020-01-01'),
  ('ISMW_THRESHOLD',               'Inter-state migrant workers min',       5,   NULL, '2020-01-01'),
  ('CANTEEN_THRESHOLD',            'Canteen required headcount',          250,   NULL, '2020-01-01'),
  ('CRECHE_THRESHOLD',             'Creche required headcount',            50,   NULL, '2020-01-01'),
  ('CRECHE_FEMALE_THRESHOLD',      'Creche female employee threshold',     30,   NULL, '2020-01-01'),
  ('BOCW_THRESHOLD',               'BOCW cess applicability cost (INR)', 1000000, NULL, '2020-01-01'),
  ('FACTORIES_ACT_THRESHOLD',      'Factories Act applicability',          10,   NULL, '2020-01-01'),
  ('SHOPS_EST_THRESHOLD',          'S&E Act applicability',                10,   NULL, '2020-01-01')
ON CONFLICT DO NOTHING;

-- ─── Compliance Masters (unit_compliance_master) ─────────────

INSERT INTO unit_compliance_master (code, name, category, state_code, frequency, applies_to) VALUES
  ('EPF',         'Employees'' Provident Fund',               'LABOUR_CODE', NULL, 'MONTHLY',     'BOTH'),
  ('ESIC',        'Employees'' State Insurance',              'LABOUR_CODE', NULL, 'MONTHLY',     'BOTH'),
  ('GRATUITY',    'Payment of Gratuity Act',                  'LABOUR_CODE', NULL, 'EVENT_BASED', 'BOTH'),
  ('BONUS',       'Payment of Bonus Act',                     'LABOUR_CODE', NULL, 'ANNUAL',      'BOTH'),
  ('MIN_WAGES',   'Minimum Wages Act',                        'LABOUR_CODE', NULL, 'MONTHLY',     'BOTH'),
  ('POW',         'Payment of Wages Act',                     'LABOUR_CODE', NULL, 'MONTHLY',     'BOTH'),
  ('MATERNITY',   'Maternity Benefit Act',                    'LABOUR_CODE', NULL, 'EVENT_BASED', 'BOTH'),
  ('POSH',        'Prevention of Sexual Harassment',          'LABOUR_CODE', NULL, 'ANNUAL',      'BOTH'),
  ('EE_COMP',     'Employees'' Compensation Act',             'LABOUR_CODE', NULL, 'EVENT_BASED', 'BOTH'),
  ('CLRA',        'Contract Labour (R&A) Act',                'LABOUR_CODE', NULL, 'ANNUAL',      'BOTH'),
  ('ISMW',        'Inter-State Migrant Workmen Act',          'LABOUR_CODE', NULL, 'ANNUAL',      'BOTH'),
  ('EQUAL_REMUN', 'Equal Remuneration Act',                   'LABOUR_CODE', NULL, 'ANNUAL',      'BOTH'),
  ('FACTORIES',   'Factories Act, 1948',                      'SAFETY',      NULL, 'ANNUAL',      'FACTORY'),
  ('BOCW',        'Building & Other Construction Workers',    'SAFETY',      NULL, 'ANNUAL',      'BOTH'),
  ('CANTEEN',     'Industrial Canteen Requirement',           'SAFETY',      NULL, 'ON_DEMAND',   'FACTORY'),
  ('CRECHE',      'Creche Facility Requirement',              'SAFETY',      NULL, 'ON_DEMAND',   'BOTH'),
  ('SHOPS_EST',   'Shops & Establishments Act',               'STATE_RULE',  NULL, 'ANNUAL',      'ESTABLISHMENT'),
  ('BEEDI_CIGAR', 'Beedi and Cigar Workers Act',              'SPECIAL_ACT', NULL, 'ANNUAL',      'FACTORY'),
  ('PLANTATION',  'Plantations Labour Act',                   'SPECIAL_ACT', NULL, 'ANNUAL',      'FACTORY'),
  ('MINES',       'Mines Act',                                'SPECIAL_ACT', NULL, 'ANNUAL',      'FACTORY'),
  ('MOTOR_TRANS', 'Motor Transport Workers Act',              'SPECIAL_ACT', NULL, 'ANNUAL',      'BOTH'),
  ('RETURN_EPF',  'EPF Monthly Return (Form 5/10/12A)',       'RETURN',      NULL, 'MONTHLY',     'BOTH'),
  ('RETURN_ESIC', 'ESIC Half-Yearly Return',                  'RETURN',      NULL, 'HALF_YEARLY', 'BOTH'),
  ('RETURN_BONUS','Bonus Annual Return (Form D)',             'RETURN',      NULL, 'ANNUAL',      'BOTH'),
  ('LIC_FACTORY', 'Factory License',                          'LICENSE',     NULL, 'ANNUAL',      'FACTORY'),
  ('LIC_SHOPS',   'S&E Registration Certificate',             'LICENSE',     NULL, 'ANNUAL',      'ESTABLISHMENT'),
  ('LIC_CLRA',    'CLRA License (Principal Employer)',         'LICENSE',     NULL, 'ANNUAL',      'BOTH')
ON CONFLICT (code) DO NOTHING;

-- ─── Applicability Rules ─────────────────────────────────────

INSERT INTO applicability_rule (name, priority, target_compliance_id, effect, conditions_json)
SELECT 'EPF coverage by headcount', 10, id, 'ENABLE',
  '{"all":[{"fact":"employee_total","op":">=","threshold":"PF_COVERAGE_THRESHOLD"}]}'::jsonb
FROM unit_compliance_master WHERE code = 'EPF'
ON CONFLICT DO NOTHING;

INSERT INTO applicability_rule (name, priority, target_compliance_id, effect, conditions_json)
SELECT 'ESIC coverage by headcount', 10, id, 'ENABLE',
  '{"all":[{"fact":"employee_total","op":">=","threshold":"ESIC_COVERAGE_THRESHOLD"}]}'::jsonb
FROM unit_compliance_master WHERE code = 'ESIC'
ON CONFLICT DO NOTHING;

INSERT INTO applicability_rule (name, priority, target_compliance_id, effect, conditions_json)
SELECT 'Gratuity by headcount', 10, id, 'ENABLE',
  '{"all":[{"fact":"employee_total","op":">=","value":10}]}'::jsonb
FROM unit_compliance_master WHERE code = 'GRATUITY'
ON CONFLICT DO NOTHING;

INSERT INTO applicability_rule (name, priority, target_compliance_id, effect, conditions_json)
SELECT 'Bonus by headcount', 10, id, 'ENABLE',
  '{"all":[{"fact":"employee_total","op":">=","value":20}]}'::jsonb
FROM unit_compliance_master WHERE code = 'BONUS'
ON CONFLICT DO NOTHING;

INSERT INTO applicability_rule (name, priority, target_compliance_id, effect, conditions_json)
SELECT 'Minimum Wages universal', 10, id, 'ENABLE',
  '{"all":[{"fact":"employee_total","op":">=","value":1}]}'::jsonb
FROM unit_compliance_master WHERE code = 'MIN_WAGES'
ON CONFLICT DO NOTHING;

INSERT INTO applicability_rule (name, priority, target_compliance_id, effect, conditions_json)
SELECT 'Payment of Wages universal', 10, id, 'ENABLE',
  '{"all":[{"fact":"employee_total","op":">=","value":1}]}'::jsonb
FROM unit_compliance_master WHERE code = 'POW'
ON CONFLICT DO NOTHING;

INSERT INTO applicability_rule (name, priority, target_compliance_id, effect, conditions_json)
SELECT 'Maternity Benefit by headcount', 10, id, 'ENABLE',
  '{"all":[{"fact":"employee_total","op":">=","value":10}]}'::jsonb
FROM unit_compliance_master WHERE code = 'MATERNITY'
ON CONFLICT DO NOTHING;

INSERT INTO applicability_rule (name, priority, target_compliance_id, effect, conditions_json)
SELECT 'POSH universal', 10, id, 'ENABLE',
  '{"all":[{"fact":"employee_total","op":">=","value":1}]}'::jsonb
FROM unit_compliance_master WHERE code = 'POSH'
ON CONFLICT DO NOTHING;

INSERT INTO applicability_rule (name, priority, target_compliance_id, effect, conditions_json)
SELECT 'Employee Compensation universal', 10, id, 'ENABLE',
  '{"all":[{"fact":"employee_total","op":">=","value":1}]}'::jsonb
FROM unit_compliance_master WHERE code = 'EE_COMP'
ON CONFLICT DO NOTHING;

INSERT INTO applicability_rule (name, priority, target_compliance_id, effect, conditions_json)
SELECT 'CLRA by contractor count', 10, id, 'ENABLE',
  '{"all":[{"fact":"contractors_count","op":">=","value":1},{"fact":"contract_workers_total","op":">=","threshold":"CLRA_THRESHOLD"}]}'::jsonb
FROM unit_compliance_master WHERE code = 'CLRA'
ON CONFLICT DO NOTHING;

INSERT INTO applicability_rule (name, priority, target_compliance_id, effect, conditions_json)
SELECT 'ISMW by migrant worker count', 10, id, 'ENABLE',
  '{"all":[{"fact":"contract_workers_total","op":">=","threshold":"ISMW_THRESHOLD"}]}'::jsonb
FROM unit_compliance_master WHERE code = 'ISMW'
ON CONFLICT DO NOTHING;

INSERT INTO applicability_rule (name, priority, target_compliance_id, effect, conditions_json)
SELECT 'Equal Remuneration universal', 10, id, 'ENABLE',
  '{"all":[{"fact":"employee_total","op":">=","value":1}]}'::jsonb
FROM unit_compliance_master WHERE code = 'EQUAL_REMUN'
ON CONFLICT DO NOTHING;

INSERT INTO applicability_rule (name, priority, target_compliance_id, effect, conditions_json)
SELECT 'Factories Act for factories', 10, id, 'ENABLE',
  '{"all":[{"fact":"establishment_type","op":"==","value":"FACTORY"},{"fact":"employee_total","op":">=","threshold":"FACTORIES_ACT_THRESHOLD"}]}'::jsonb
FROM unit_compliance_master WHERE code = 'FACTORIES'
ON CONFLICT DO NOTHING;

INSERT INTO applicability_rule (name, priority, target_compliance_id, effect, conditions_json)
SELECT 'BOCW for construction projects', 10, id, 'ENABLE',
  '{"all":[{"fact":"is_bocw_project","op":"==","value":true}]}'::jsonb
FROM unit_compliance_master WHERE code = 'BOCW'
ON CONFLICT DO NOTHING;

INSERT INTO applicability_rule (name, priority, target_compliance_id, effect, conditions_json)
SELECT 'Canteen for large factories', 10, id, 'ENABLE',
  '{"all":[{"fact":"employee_total","op":">=","threshold":"CANTEEN_THRESHOLD"},{"fact":"establishment_type","op":"==","value":"FACTORY"}]}'::jsonb
FROM unit_compliance_master WHERE code = 'CANTEEN'
ON CONFLICT DO NOTHING;

INSERT INTO applicability_rule (name, priority, target_compliance_id, effect, conditions_json)
SELECT 'Creche by female count or total', 10, id, 'ENABLE',
  '{"any":[{"fact":"employee_female","op":">=","threshold":"CRECHE_FEMALE_THRESHOLD"},{"fact":"employee_total","op":">=","threshold":"CRECHE_THRESHOLD"}]}'::jsonb
FROM unit_compliance_master WHERE code = 'CRECHE'
ON CONFLICT DO NOTHING;

INSERT INTO applicability_rule (name, priority, target_compliance_id, effect, conditions_json)
SELECT 'S&E for establishments', 10, id, 'ENABLE',
  '{"all":[{"fact":"establishment_type","op":"==","value":"ESTABLISHMENT"}]}'::jsonb
FROM unit_compliance_master WHERE code = 'SHOPS_EST'
ON CONFLICT DO NOTHING;

INSERT INTO applicability_rule (name, priority, target_compliance_id, effect, conditions_json)
SELECT 'EPF Return when EPF applicable', 10, id, 'ENABLE',
  '{"all":[{"fact":"employee_total","op":">=","threshold":"PF_COVERAGE_THRESHOLD"}]}'::jsonb
FROM unit_compliance_master WHERE code = 'RETURN_EPF'
ON CONFLICT DO NOTHING;

INSERT INTO applicability_rule (name, priority, target_compliance_id, effect, conditions_json)
SELECT 'ESIC Return when ESIC applicable', 10, id, 'ENABLE',
  '{"all":[{"fact":"employee_total","op":">=","threshold":"ESIC_COVERAGE_THRESHOLD"}]}'::jsonb
FROM unit_compliance_master WHERE code = 'RETURN_ESIC'
ON CONFLICT DO NOTHING;

INSERT INTO applicability_rule (name, priority, target_compliance_id, effect, conditions_json)
SELECT 'Bonus Return when Bonus applicable', 10, id, 'ENABLE',
  '{"all":[{"fact":"employee_total","op":">=","value":20}]}'::jsonb
FROM unit_compliance_master WHERE code = 'RETURN_BONUS'
ON CONFLICT DO NOTHING;

INSERT INTO applicability_rule (name, priority, target_compliance_id, effect, conditions_json)
SELECT 'Factory License for factories', 10, id, 'ENABLE',
  '{"all":[{"fact":"establishment_type","op":"==","value":"FACTORY"}]}'::jsonb
FROM unit_compliance_master WHERE code = 'LIC_FACTORY'
ON CONFLICT DO NOTHING;

INSERT INTO applicability_rule (name, priority, target_compliance_id, effect, conditions_json)
SELECT 'S&E Registration for establishments', 10, id, 'ENABLE',
  '{"all":[{"fact":"establishment_type","op":"==","value":"ESTABLISHMENT"}]}'::jsonb
FROM unit_compliance_master WHERE code = 'LIC_SHOPS'
ON CONFLICT DO NOTHING;

INSERT INTO applicability_rule (name, priority, target_compliance_id, effect, conditions_json)
SELECT 'CLRA License when CLRA applicable', 10, id, 'ENABLE',
  '{"all":[{"fact":"contractors_count","op":">=","value":1},{"fact":"contract_workers_total","op":">=","threshold":"CLRA_THRESHOLD"}]}'::jsonb
FROM unit_compliance_master WHERE code = 'LIC_CLRA'
ON CONFLICT DO NOTHING;

-- ─── Link compliances and rules to DEFAULT_INDIA package ─────

INSERT INTO package_compliance (package_id, compliance_id)
SELECT
  (SELECT id FROM compliance_package WHERE code = 'DEFAULT_INDIA'),
  id
FROM unit_compliance_master
WHERE is_active = true
ON CONFLICT DO NOTHING;

INSERT INTO package_rule (package_id, rule_id)
SELECT
  (SELECT id FROM compliance_package WHERE code = 'DEFAULT_INDIA'),
  id
FROM applicability_rule
WHERE is_active = true
ON CONFLICT DO NOTHING;
