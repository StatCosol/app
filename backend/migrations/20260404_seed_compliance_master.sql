-- Seed compliance_master with Indian labour compliance data
-- Required for admin branch compliance applicability page

-- Add unique constraint on code if missing
CREATE UNIQUE INDEX IF NOT EXISTS uq_compliance_master_code ON compliance_master (code);

INSERT INTO compliance_master (code, compliance_name, law_name, law_family, state_scope, min_headcount, max_headcount, frequency, description, is_active)
VALUES
  -- FACTORY ONLY
  ('FACTORIES_ACT',   'Factories Act, 1948',                                        'Factories Act, 1948',                                        'FACTORY_ACT',         'ALL', NULL, NULL, 'YEARLY',      'Factory registration & ongoing compliance', true),
  ('CODE_OSH',        'Code on OSH',                                                'Code on Occupational Safety, Health & Working Conditions',   'FACTORY_ACT',         'ALL', NULL, NULL, 'YEARLY',      'OSH compliance for establishments/factories as applicable', true),

  -- SHOPS / ESTABLISHMENT ONLY
  ('SHOPS_EST_ACT',   'Shops & Establishments Act',                                 'Shops & Establishments Act',                                 'SHOPS_ESTABLISHMENTS','ALL', NULL, NULL, 'YEARLY',      'S&E Act compliance for establishments/office branches', true),

  -- LABOUR CODES (BOTH)
  ('CODE_WAGES',      'Code on Wages',                                              'Code on Wages',                                              'LABOUR_CODE',         'ALL', NULL, NULL, 'MONTHLY',     'Wage compliance obligations', true),
  ('CODE_SOC_SEC',    'Code on Social Security',                                    'Code on Social Security',                                    'LABOUR_CODE',         'ALL', NULL, NULL, 'MONTHLY',     'Social security obligations', true),
  ('CODE_IR',         'Code on Industrial Relations',                               'Code on Industrial Relations',                               'LABOUR_CODE',         'ALL', NULL, NULL, 'YEARLY',      'Industrial relations obligations', true),

  -- EPF / ESIC etc.
  ('EPF_ACT',         'Employees'' Provident Fund & MP Act',                        'Employees'' Provident Fund & MP Act, 1952',                  'LABOUR_CODE',         'ALL', 20,   NULL, 'MONTHLY',    'EPF compliance for establishments with 20+ employees', true),
  ('ESIC_ACT',        'Employees'' State Insurance Act',                            'Employees'' State Insurance Act, 1948',                      'LABOUR_CODE',         'ALL', 10,   NULL, 'MONTHLY',    'ESIC compliance for establishments with 10+ employees', true),
  ('GRATUITY_ACT',    'Payment of Gratuity Act',                                    'Payment of Gratuity Act, 1972',                              'LABOUR_CODE',         'ALL', 10,   NULL, 'YEARLY',     'Gratuity compliance for 10+ employee establishments', true),
  ('BONUS_ACT',       'Payment of Bonus Act',                                       'Payment of Bonus Act, 1965',                                 'LABOUR_CODE',         'ALL', 20,   NULL, 'YEARLY',     'Bonus compliance for 20+ employee establishments', true),
  ('MIN_WAGES_ACT',   'Minimum Wages Act',                                          'Minimum Wages Act, 1948',                                    'LABOUR_CODE',         'ALL', NULL, NULL, 'MONTHLY',    'Minimum wages compliance', true),
  ('POW_ACT',         'Payment of Wages Act',                                       'Payment of Wages Act, 1936',                                 'LABOUR_CODE',         'ALL', NULL, NULL, 'MONTHLY',    'Payment of wages compliance', true),
  ('MATERNITY_ACT',   'Maternity Benefit Act',                                      'Maternity Benefit Act, 1961',                                'LABOUR_CODE',         'ALL', 10,   NULL, 'EVENT_BASED','Maternity benefit compliance', true),
  ('POSH_ACT',        'Prevention of Sexual Harassment',                            'Sexual Harassment of Women at Workplace Act, 2013',          'LABOUR_CODE',         'ALL', NULL, NULL, 'YEARLY',     'POSH compliance', true),
  ('EE_COMP_ACT',     'Employees'' Compensation Act',                               'Employees'' Compensation Act, 1923',                         'LABOUR_CODE',         'ALL', NULL, NULL, 'EVENT_BASED','Employees compensation compliance', true),
  ('CLRA_ACT',        'Contract Labour (R&A) Act',                                  'Contract Labour (Regulation & Abolition) Act, 1970',         'LABOUR_CODE',         'ALL', 20,   NULL, 'YEARLY',     'Contract labour regulation compliance', true),
  ('ISMW_ACT',        'Inter-State Migrant Workmen Act',                            'Inter-State Migrant Workmen Act, 1979',                      'LABOUR_CODE',         'ALL', 5,    NULL, 'YEARLY',     'Interstate migrant workers compliance', true),
  ('EQUAL_REMUN_ACT', 'Equal Remuneration Act',                                     'Equal Remuneration Act, 1976',                               'LABOUR_CODE',         'ALL', NULL, NULL, 'YEARLY',     'Equal remuneration compliance', true),

  -- STATE ACTS
  ('PROF_TAX',        'Professional Tax Act',                                       'Professional Tax Act',                                       'LABOUR_CODE',         'TS,AP,KA,TN,MH,DL', NULL, NULL, 'MONTHLY',  'State professional tax where applicable', true),
  ('LWF_ACT',         'Labour Welfare Fund Act',                                    'Labour Welfare Fund Act',                                    'LABOUR_CODE',         'TS,AP,KA,TN,MH,DL', NULL, NULL, 'HALF_YEARLY','State LWF where applicable', true),
  ('EMP_EXCHANGE',    'Employment Exchange Act',                                    'Employment Exchange (Compulsory Notification of Vacancies) Act, 1959', 'LABOUR_CODE','ALL', NULL, NULL, 'YEARLY', 'Employment exchange / notification requirements', true)
ON CONFLICT (code) DO NOTHING;
