-- =============================================================
-- Applicability Engine Seed Data
-- Labour Codes + Special Acts + Compliance Masters + Rules
-- =============================================================

-- 1) Labour Codes
INSERT INTO ae_labour_code (id, code, name) VALUES
  (gen_random_uuid(), 'WAGES', 'Code on Wages, 2019'),
  (gen_random_uuid(), 'SS',    'Code on Social Security, 2020'),
  (gen_random_uuid(), 'IR',    'Industrial Relations Code, 2020'),
  (gen_random_uuid(), 'OSH',   'Occupational Safety, Health and Working Conditions Code, 2020')
ON CONFLICT (code) DO NOTHING;

-- 2) Act Masters (special acts that can be toggled per unit)
INSERT INTO ae_act_master (id, code, name, scope, requires_profile, has_license, is_active) VALUES
  (gen_random_uuid(), 'FACTORIES_ACT',   'Factories Act, 1948',                      'BRANCH', true,  true,  true),
  (gen_random_uuid(), 'SHOPS_EST',       'Shops & Establishments Act',               'BRANCH', false, true,  true),
  (gen_random_uuid(), 'BOCW',            'Building & Other Construction Workers Act', 'BRANCH', true,  true,  true),
  (gen_random_uuid(), 'FSSAI',           'Food Safety (FSSAI)',                       'BRANCH', true,  true,  true),
  (gen_random_uuid(), 'PSARA',           'Private Security Agencies Regulation Act',  'BRANCH', true,  true,  true),
  (gen_random_uuid(), 'CLRA',            'Contract Labour (R&A) Act',                'BRANCH', false, true,  true),
  (gen_random_uuid(), 'ISMW',            'Inter-State Migrant Workers Act',          'BRANCH', false, false, true),
  (gen_random_uuid(), 'MINES',           'Mines Act, 1952',                          'BRANCH', true,  true,  true),
  (gen_random_uuid(), 'MOTOR_TRANSPORT', 'Motor Transport Workers Act',              'BRANCH', false, false, true),
  (gen_random_uuid(), 'PLANTATION',      'Plantation Labour Act',                    'BRANCH', false, true,  true)
ON CONFLICT (code) DO NOTHING;

-- 3) Packages
INSERT INTO ae_package_master (id, code, name, scope) VALUES
  (gen_random_uuid(), 'PKG_FACTORY_CORE',  'Factory Core Compliances',        'BRANCH'),
  (gen_random_uuid(), 'PKG_ESTAB_CORE',    'Establishment Core Compliances',  'BRANCH'),
  (gen_random_uuid(), 'PKG_PF',            'Provident Fund Compliances',      'BRANCH'),
  (gen_random_uuid(), 'PKG_ESI',           'ESI Compliances',                 'BRANCH'),
  (gen_random_uuid(), 'PKG_PT',            'Professional Tax Compliances',    'BRANCH'),
  (gen_random_uuid(), 'PKG_LWF',           'Labour Welfare Fund Compliances', 'BRANCH'),
  (gen_random_uuid(), 'PKG_FACTORY_SAFETY','Factory Safety Compliances',      'BRANCH'),
  (gen_random_uuid(), 'PKG_HAZARDOUS',     'Hazardous Process Compliances',   'BRANCH'),
  (gen_random_uuid(), 'PKG_BOCW',          'BOCW Site Compliances',           'BRANCH'),
  (gen_random_uuid(), 'PKG_CLRA',          'Contract Labour Compliances',     'BRANCH')
ON CONFLICT (code) DO NOTHING;

-- 4) Compliance Masters (representative set for Indian labour compliance)
INSERT INTO ae_compliance_master (id, code, name, labour_code, group_code, periodicity, is_active) VALUES
  -- PF compliances
  (gen_random_uuid(), 'PF_CHALLAN',         'PF Monthly Challan Payment',               'SS', 'SS/PF',   'MONTHLY',     true),
  (gen_random_uuid(), 'PF_ECR',             'PF ECR Filing',                            'SS', 'SS/PF',   'MONTHLY',     true),
  (gen_random_uuid(), 'PF_KYC',             'PF KYC Compliance',                        'SS', 'SS/PF',   'AS_REQUIRED', true),
  (gen_random_uuid(), 'PF_ANNUAL_RETURN',   'PF Annual Return',                         'SS', 'SS/PF',   'ANNUAL',      true),
  -- ESI compliances
  (gen_random_uuid(), 'ESI_CHALLAN',        'ESI Monthly Challan Payment',              'SS', 'SS/ESI',  'MONTHLY',     true),
  (gen_random_uuid(), 'ESI_HALF_YEARLY',    'ESI Half-Yearly Return',                   'SS', 'SS/ESI',  'HALF_YEARLY', true),
  -- Professional Tax
  (gen_random_uuid(), 'PT_MONTHLY',         'Professional Tax Monthly Payment',         'SS', 'SS/PT',   'MONTHLY',     true),
  (gen_random_uuid(), 'PT_ANNUAL_RETURN',   'Professional Tax Annual Return',           'SS', 'SS/PT',   'ANNUAL',      true),
  -- LWF
  (gen_random_uuid(), 'LWF_CONTRIBUTION',   'Labour Welfare Fund Contribution',         'SS', 'SS/LWF',  'HALF_YEARLY', true),
  -- Wages code
  (gen_random_uuid(), 'MIN_WAGES_REG',      'Minimum Wages Register',                   'WAGES', 'WAGES/REG', 'MONTHLY', true),
  (gen_random_uuid(), 'WAGES_REGISTER',     'Wages Register',                           'WAGES', 'WAGES/REG', 'MONTHLY', true),
  (gen_random_uuid(), 'OVERTIME_REG',       'Overtime Register',                        'WAGES', 'WAGES/REG', 'MONTHLY', true),
  (gen_random_uuid(), 'BONUS_PAYMENT',      'Bonus Payment & Return',                   'WAGES', 'WAGES/BONUS','ANNUAL', true),
  (gen_random_uuid(), 'EQUAL_REMUNERATION', 'Equal Remuneration Compliance',            'WAGES', 'WAGES/ER',  'ANNUAL', true),
  -- Factory Act / OSH Code
  (gen_random_uuid(), 'FACTORY_LICENSE',    'Factory License Renewal',                  'OSH', 'OSH/FACTORY',   'ANNUAL',  true),
  (gen_random_uuid(), 'FACTORY_REGISTER',   'Factory Register (Form 25)',               'OSH', 'OSH/FACTORY',   'ANNUAL',  true),
  (gen_random_uuid(), 'ANNUAL_RETURN_FACT', 'Annual Return under Factories Act',        'OSH', 'OSH/FACTORY',   'ANNUAL',  true),
  (gen_random_uuid(), 'HALF_YEARLY_FACT',   'Half-Yearly Return under Factories Act',   'OSH', 'OSH/FACTORY',   'HALF_YEARLY', true),
  (gen_random_uuid(), 'HEALTH_REG',         'Health & Safety Register',                 'OSH', 'OSH/FACTORY',   'MONTHLY', true),
  (gen_random_uuid(), 'ACCIDENT_REPORT',    'Accident / Dangerous Occurrence Report',   'OSH', 'OSH/SAFETY',    'EVENT',   true),
  (gen_random_uuid(), 'FIRE_NOC',           'Fire Safety NOC',                          'OSH', 'OSH/SAFETY',    'ANNUAL',  true),
  (gen_random_uuid(), 'SAFETY_COMMITTEE',   'Safety Committee Meeting Minutes',         'OSH', 'OSH/SAFETY',    'QUARTERLY', true),
  (gen_random_uuid(), 'SAFETY_AUDIT',       'Safety Audit Report',                      'OSH', 'OSH/SAFETY',    'ANNUAL',  true),
  (gen_random_uuid(), 'HAZARDOUS_PROCESS',  'Hazardous Process Registration',           'OSH', 'OSH/HAZARDOUS', 'ANNUAL',  true),
  (gen_random_uuid(), 'POLLUTION_CONSENT',  'Pollution Control Board Consent',          'OSH', 'OSH/HAZARDOUS', 'ANNUAL',  true),
  -- Shops & Establishment
  (gen_random_uuid(), 'SHOP_LICENSE',       'Shop & Establishment License',             'OSH', 'OSH/SHOPS',     'ANNUAL',  true),
  (gen_random_uuid(), 'SHOP_REGISTER',      'Shop & Establishment Register',            'OSH', 'OSH/SHOPS',     'ANNUAL',  true),
  -- Industrial Relations
  (gen_random_uuid(), 'STANDING_ORDERS',    'Standing Orders Certification',            'IR',  'IR/SO',   'AS_REQUIRED', true),
  (gen_random_uuid(), 'IR_ANNUAL_RETURN',   'Return under IR Code',                     'IR',  'IR/RET',  'ANNUAL',      true),
  -- Contract Labour
  (gen_random_uuid(), 'CLRA_LICENSE',       'CLRA Principal Employer License',          'OSH', 'OSH/CLRA', 'ANNUAL', true),
  (gen_random_uuid(), 'CLRA_REGISTER',      'CLRA Register of Contractors',             'OSH', 'OSH/CLRA', 'MONTHLY', true),
  (gen_random_uuid(), 'CLRA_HALF_RETURN',   'CLRA Half-Yearly Return',                  'OSH', 'OSH/CLRA', 'HALF_YEARLY', true),
  -- BOCW
  (gen_random_uuid(), 'BOCW_REG',           'BOCW Registration of Establishment',       'OSH', 'OSH/BOCW', 'ANNUAL', true),
  (gen_random_uuid(), 'BOCW_CESS',          'BOCW Cess Return',                         'OSH', 'OSH/BOCW', 'MONTHLY', true)
ON CONFLICT (code) DO NOTHING;

-- 5) Package Items (link compliance masters to packages)
-- Use subqueries to resolve IDs dynamically

-- PKG_PF items
INSERT INTO ae_package_item (id, package_code, compliance_id)
SELECT gen_random_uuid(), 'PKG_PF', id FROM ae_compliance_master WHERE code IN ('PF_CHALLAN','PF_ECR','PF_KYC','PF_ANNUAL_RETURN')
ON CONFLICT (package_code, compliance_id) DO NOTHING;

-- PKG_ESI items
INSERT INTO ae_package_item (id, package_code, compliance_id)
SELECT gen_random_uuid(), 'PKG_ESI', id FROM ae_compliance_master WHERE code IN ('ESI_CHALLAN','ESI_HALF_YEARLY')
ON CONFLICT (package_code, compliance_id) DO NOTHING;

-- PKG_PT items
INSERT INTO ae_package_item (id, package_code, compliance_id)
SELECT gen_random_uuid(), 'PKG_PT', id FROM ae_compliance_master WHERE code IN ('PT_MONTHLY','PT_ANNUAL_RETURN')
ON CONFLICT (package_code, compliance_id) DO NOTHING;

-- PKG_LWF items
INSERT INTO ae_package_item (id, package_code, compliance_id)
SELECT gen_random_uuid(), 'PKG_LWF', id FROM ae_compliance_master WHERE code IN ('LWF_CONTRIBUTION')
ON CONFLICT (package_code, compliance_id) DO NOTHING;

-- PKG_FACTORY_CORE items
INSERT INTO ae_package_item (id, package_code, compliance_id)
SELECT gen_random_uuid(), 'PKG_FACTORY_CORE', id FROM ae_compliance_master WHERE code IN ('FACTORY_LICENSE','FACTORY_REGISTER','ANNUAL_RETURN_FACT','HALF_YEARLY_FACT','HEALTH_REG')
ON CONFLICT (package_code, compliance_id) DO NOTHING;

-- PKG_ESTAB_CORE items
INSERT INTO ae_package_item (id, package_code, compliance_id)
SELECT gen_random_uuid(), 'PKG_ESTAB_CORE', id FROM ae_compliance_master WHERE code IN ('SHOP_LICENSE','SHOP_REGISTER','MIN_WAGES_REG','WAGES_REGISTER')
ON CONFLICT (package_code, compliance_id) DO NOTHING;

-- PKG_FACTORY_SAFETY items
INSERT INTO ae_package_item (id, package_code, compliance_id)
SELECT gen_random_uuid(), 'PKG_FACTORY_SAFETY', id FROM ae_compliance_master WHERE code IN ('FIRE_NOC','SAFETY_COMMITTEE','SAFETY_AUDIT','ACCIDENT_REPORT')
ON CONFLICT (package_code, compliance_id) DO NOTHING;

-- PKG_HAZARDOUS items
INSERT INTO ae_package_item (id, package_code, compliance_id)
SELECT gen_random_uuid(), 'PKG_HAZARDOUS', id FROM ae_compliance_master WHERE code IN ('HAZARDOUS_PROCESS','POLLUTION_CONSENT')
ON CONFLICT (package_code, compliance_id) DO NOTHING;

-- PKG_CLRA items
INSERT INTO ae_package_item (id, package_code, compliance_id)
SELECT gen_random_uuid(), 'PKG_CLRA', id FROM ae_compliance_master WHERE code IN ('CLRA_LICENSE','CLRA_REGISTER','CLRA_HALF_RETURN')
ON CONFLICT (package_code, compliance_id) DO NOTHING;

-- PKG_BOCW items
INSERT INTO ae_package_item (id, package_code, compliance_id)
SELECT gen_random_uuid(), 'PKG_BOCW', id FROM ae_compliance_master WHERE code IN ('BOCW_REG','BOCW_CESS')
ON CONFLICT (package_code, compliance_id) DO NOTHING;

-- 6) Act-to-Package mappings
INSERT INTO ae_act_package_map (id, act_code, package_code) VALUES
  (gen_random_uuid(), 'FACTORIES_ACT', 'PKG_FACTORY_CORE'),
  (gen_random_uuid(), 'FACTORIES_ACT', 'PKG_FACTORY_SAFETY'),
  (gen_random_uuid(), 'BOCW',          'PKG_BOCW'),
  (gen_random_uuid(), 'CLRA',          'PKG_CLRA')
ON CONFLICT (act_code, package_code) DO NOTHING;

-- 7) Rules (conditions-based auto-applicability)

-- Rule 1: PF applicable when employee_total >= 20
INSERT INTO ae_rule_master (id, name, priority, enabled, scope, apply_mode, target_package_code, effect_json)
VALUES (
  'a0000001-0000-0000-0000-000000000001',
  'PF applicable when 20+ employees',
  10, true, 'BRANCH', 'ATTACH_PACKAGE', 'PKG_PF',
  '{"source":"AUTO_RULE","locked":true}'
) ON CONFLICT DO NOTHING;

INSERT INTO ae_rule_condition (id, rule_id, condition_json)
VALUES (
  'b0000001-0000-0000-0000-000000000001',
  'a0000001-0000-0000-0000-000000000001',
  '{"all":[{"left":"facts.employee_total","op":"GTE","right":20}]}'
) ON CONFLICT DO NOTHING;

-- Rule 2: ESI applicable when employee_total >= 10
INSERT INTO ae_rule_master (id, name, priority, enabled, scope, apply_mode, target_package_code, effect_json)
VALUES (
  'a0000002-0000-0000-0000-000000000002',
  'ESI applicable when 10+ employees',
  20, true, 'BRANCH', 'ATTACH_PACKAGE', 'PKG_ESI',
  '{"source":"AUTO_RULE","locked":true}'
) ON CONFLICT DO NOTHING;

INSERT INTO ae_rule_condition (id, rule_id, condition_json)
VALUES (
  'b0000002-0000-0000-0000-000000000002',
  'a0000002-0000-0000-0000-000000000002',
  '{"all":[{"left":"facts.employee_total","op":"GTE","right":10}]}'
) ON CONFLICT DO NOTHING;

-- Rule 3: PT applicable to all establishments (>= 1 employee)
INSERT INTO ae_rule_master (id, name, priority, enabled, scope, apply_mode, target_package_code, effect_json)
VALUES (
  'a0000003-0000-0000-0000-000000000003',
  'Professional Tax applicable for all',
  30, true, 'BRANCH', 'ATTACH_PACKAGE', 'PKG_PT',
  '{"source":"AUTO_RULE","locked":true}'
) ON CONFLICT DO NOTHING;

INSERT INTO ae_rule_condition (id, rule_id, condition_json)
VALUES (
  'b0000003-0000-0000-0000-000000000003',
  'a0000003-0000-0000-0000-000000000003',
  '{"all":[{"left":"facts.employee_total","op":"GTE","right":1}]}'
) ON CONFLICT DO NOTHING;

-- Rule 4: LWF applicable (varies by state, using general rule >= 1)
INSERT INTO ae_rule_master (id, name, priority, enabled, scope, apply_mode, target_package_code, effect_json)
VALUES (
  'a0000004-0000-0000-0000-000000000004',
  'Labour Welfare Fund applicable',
  40, true, 'BRANCH', 'ATTACH_PACKAGE', 'PKG_LWF',
  '{"source":"AUTO_RULE","locked":true}'
) ON CONFLICT DO NOTHING;

INSERT INTO ae_rule_condition (id, rule_id, condition_json)
VALUES (
  'b0000004-0000-0000-0000-000000000004',
  'a0000004-0000-0000-0000-000000000004',
  '{"all":[{"left":"facts.employee_total","op":"GTE","right":1}]}'
) ON CONFLICT DO NOTHING;

-- Rule 5: Factory Core when establishment_type = FACTORY
INSERT INTO ae_rule_master (id, name, priority, enabled, scope, apply_mode, target_package_code, effect_json)
VALUES (
  'a0000005-0000-0000-0000-000000000005',
  'Factory Act compliances for factories',
  50, true, 'BRANCH', 'ATTACH_PACKAGE', 'PKG_FACTORY_CORE',
  '{"source":"AUTO_RULE","locked":true}'
) ON CONFLICT DO NOTHING;

INSERT INTO ae_rule_condition (id, rule_id, condition_json)
VALUES (
  'b0000005-0000-0000-0000-000000000005',
  'a0000005-0000-0000-0000-000000000005',
  '{"all":[{"left":"unit.establishmentType","op":"IN","right":["FACTORY","BOCW_SITE"]}]}'
) ON CONFLICT DO NOTHING;

-- Rule 6: Establishment Core when establishment_type = ESTABLISHMENT
INSERT INTO ae_rule_master (id, name, priority, enabled, scope, apply_mode, target_package_code, effect_json)
VALUES (
  'a0000006-0000-0000-0000-000000000006',
  'Shops & Establishment compliances',
  60, true, 'BRANCH', 'ATTACH_PACKAGE', 'PKG_ESTAB_CORE',
  '{"source":"AUTO_RULE","locked":true}'
) ON CONFLICT DO NOTHING;

INSERT INTO ae_rule_condition (id, rule_id, condition_json)
VALUES (
  'b0000006-0000-0000-0000-000000000006',
  'a0000006-0000-0000-0000-000000000006',
  '{"all":[{"left":"unit.establishmentType","op":"EQ","right":"ESTABLISHMENT"}]}'
) ON CONFLICT DO NOTHING;

-- Rule 7: Factory Safety when factory + 50+ employees
INSERT INTO ae_rule_master (id, name, priority, enabled, scope, apply_mode, target_package_code, effect_json)
VALUES (
  'a0000007-0000-0000-0000-000000000007',
  'Factory Safety for 50+ employee factories',
  70, true, 'BRANCH', 'ATTACH_PACKAGE', 'PKG_FACTORY_SAFETY',
  '{"source":"AUTO_RULE","locked":true}'
) ON CONFLICT DO NOTHING;

INSERT INTO ae_rule_condition (id, rule_id, condition_json)
VALUES (
  'b0000007-0000-0000-0000-000000000007',
  'a0000007-0000-0000-0000-000000000007',
  '{"all":[{"left":"unit.establishmentType","op":"IN","right":["FACTORY","BOCW_SITE"]},{"left":"facts.employee_total","op":"GTE","right":50}]}'
) ON CONFLICT DO NOTHING;

-- Rule 8: Hazardous Process when hazardous
INSERT INTO ae_rule_master (id, name, priority, enabled, scope, apply_mode, target_package_code, effect_json)
VALUES (
  'a0000008-0000-0000-0000-000000000008',
  'Hazardous Process compliances',
  80, true, 'BRANCH', 'ATTACH_PACKAGE', 'PKG_HAZARDOUS',
  '{"source":"AUTO_RULE","locked":true}'
) ON CONFLICT DO NOTHING;

INSERT INTO ae_rule_condition (id, rule_id, condition_json)
VALUES (
  'b0000008-0000-0000-0000-000000000008',
  'a0000008-0000-0000-0000-000000000008',
  '{"all":[{"left":"unit.plantType","op":"EQ","right":"HAZARDOUS"}]}'
) ON CONFLICT DO NOTHING;

-- Rule 9: CLRA when contract_workers_total >= 20
INSERT INTO ae_rule_master (id, name, priority, enabled, scope, apply_mode, target_package_code, effect_json)
VALUES (
  'a0000009-0000-0000-0000-000000000009',
  'Contract Labour compliances for 20+ contract workers',
  90, true, 'BRANCH', 'ATTACH_PACKAGE', 'PKG_CLRA',
  '{"source":"AUTO_RULE","locked":true}'
) ON CONFLICT DO NOTHING;

INSERT INTO ae_rule_condition (id, rule_id, condition_json)
VALUES (
  'b0000009-0000-0000-0000-000000000009',
  'a0000009-0000-0000-0000-000000000009',
  '{"all":[{"left":"facts.contract_workers_total","op":"GTE","right":20}]}'
) ON CONFLICT DO NOTHING;

-- Rule 10: Wages registers for all with employees
INSERT INTO ae_rule_master (id, name, priority, enabled, scope, apply_mode, target_compliance_id, effect_json)
SELECT
  'a0000010-0000-0000-0000-000000000010',
  'Bonus payment for 20+ employees',
  100, true, 'BRANCH', 'ATTACH_COMPLIANCE', id,
  '{"source":"AUTO_RULE","locked":true}'
FROM ae_compliance_master WHERE code = 'BONUS_PAYMENT'
ON CONFLICT DO NOTHING;

INSERT INTO ae_rule_condition (id, rule_id, condition_json)
VALUES (
  'b0000010-0000-0000-0000-000000000010',
  'a0000010-0000-0000-0000-000000000010',
  '{"all":[{"left":"facts.employee_total","op":"GTE","right":20}]}'
) ON CONFLICT DO NOTHING;

-- Rule 11: Standing Orders for 100+ employees
INSERT INTO ae_rule_master (id, name, priority, enabled, scope, apply_mode, target_compliance_id, effect_json)
SELECT
  'a0000011-0000-0000-0000-000000000011',
  'Standing Orders for 100+ employees',
  110, true, 'BRANCH', 'ATTACH_COMPLIANCE', id,
  '{"source":"AUTO_RULE","locked":true}'
FROM ae_compliance_master WHERE code = 'STANDING_ORDERS'
ON CONFLICT DO NOTHING;

INSERT INTO ae_rule_condition (id, rule_id, condition_json)
VALUES (
  'b0000011-0000-0000-0000-000000000011',
  'a0000011-0000-0000-0000-000000000011',
  '{"all":[{"left":"facts.employee_total","op":"GTE","right":100}]}'
) ON CONFLICT DO NOTHING;

-- Rule 12: IR Annual Return for 20+ employees
INSERT INTO ae_rule_master (id, name, priority, enabled, scope, apply_mode, target_compliance_id, effect_json)
SELECT
  'a0000012-0000-0000-0000-000000000012',
  'IR Annual Return for 20+ employees',
  120, true, 'BRANCH', 'ATTACH_COMPLIANCE', id,
  '{"source":"AUTO_RULE","locked":true}'
FROM ae_compliance_master WHERE code = 'IR_ANNUAL_RETURN'
ON CONFLICT DO NOTHING;

INSERT INTO ae_rule_condition (id, rule_id, condition_json)
VALUES (
  'b0000012-0000-0000-0000-000000000012',
  'a0000012-0000-0000-0000-000000000012',
  '{"all":[{"left":"facts.employee_total","op":"GTE","right":20}]}'
) ON CONFLICT DO NOTHING;
