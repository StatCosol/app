-- ============================================================
-- Register Applicability Engine v2
-- Adds: new columns, new register types, HR state, applicability conditions
-- ============================================================

-- ─── 1. SCHEMA CHANGES ───
ALTER TABLE register_templates
  ADD COLUMN IF NOT EXISTS law_family      VARCHAR(60),
  ADD COLUMN IF NOT EXISTS form_code       VARCHAR(30),
  ADD COLUMN IF NOT EXISTS register_mode   VARCHAR(20) DEFAULT 'STATE_OLD',
  ADD COLUMN IF NOT EXISTS frequency       VARCHAR(20) DEFAULT 'MONTHLY',
  ADD COLUMN IF NOT EXISTS applies_when    JSONB DEFAULT '{}'::jsonb;

-- ─── 2. UPDATE EXISTING TEMPLATES WITH METADATA ───

-- Law family
UPDATE register_templates SET law_family = 'CODE_ON_WAGES'
  WHERE register_type IN ('WAGE_REGISTER','MUSTER_ROLL','OVERTIME_REGISTER','LEAVE_REGISTER','DEDUCTION_REGISTER');
UPDATE register_templates SET law_family = 'SOCIAL_SECURITY'
  WHERE register_type IN ('PF_REGISTER','ESI_REGISTER');
UPDATE register_templates SET law_family = 'STATE_TAX'
  WHERE register_type = 'PT_REGISTER';
UPDATE register_templates SET law_family = 'BONUS_ACT', frequency = 'ANNUAL'
  WHERE register_type = 'BONUS_REGISTER';

-- Register mode
UPDATE register_templates SET register_mode = 'CENTRAL_COMBINED' WHERE state_code = 'ALL';
UPDATE register_templates SET register_mode = 'STATE_NEW' WHERE state_code IN ('TS','AP','MH');
UPDATE register_templates SET register_mode = 'HYBRID' WHERE state_code IN ('KA','TN','GJ','DL','WB','RJ');

-- Applies-when for conditional registers
UPDATE register_templates SET applies_when = '{"requires_pf": true}'::jsonb WHERE register_type = 'PF_REGISTER';
UPDATE register_templates SET applies_when = '{"requires_esi": true}'::jsonb WHERE register_type = 'ESI_REGISTER';

-- Form codes for existing state templates
-- TS
UPDATE register_templates SET form_code = 'Form XII'  WHERE state_code='TS' AND establishment_type='FACTORY' AND register_type='WAGE_REGISTER';
UPDATE register_templates SET form_code = 'Form 25'   WHERE state_code='TS' AND establishment_type='FACTORY' AND register_type='MUSTER_ROLL';
UPDATE register_templates SET form_code = 'Form IX'   WHERE state_code='TS' AND establishment_type='FACTORY' AND register_type='OVERTIME_REGISTER';
UPDATE register_templates SET form_code = 'Form 15'   WHERE state_code='TS' AND establishment_type='FACTORY' AND register_type='LEAVE_REGISTER';
UPDATE register_templates SET form_code = 'Form VI'   WHERE state_code='TS' AND establishment_type='ESTABLISHMENT' AND register_type='LEAVE_REGISTER';
UPDATE register_templates SET form_code = 'Form IV'   WHERE state_code='TS' AND establishment_type='ESTABLISHMENT' AND register_type='MUSTER_ROLL';
UPDATE register_templates SET form_code = 'Form V'    WHERE state_code='TS' AND establishment_type='ESTABLISHMENT' AND register_type='WAGE_REGISTER';
-- AP
UPDATE register_templates SET form_code = 'Form 15'   WHERE state_code='AP' AND establishment_type='FACTORY' AND register_type='WAGE_REGISTER';
UPDATE register_templates SET form_code = 'Form 14'   WHERE state_code='AP' AND establishment_type='FACTORY' AND register_type='MUSTER_ROLL';
UPDATE register_templates SET form_code = 'Form 10'   WHERE state_code='AP' AND establishment_type='FACTORY' AND register_type='OVERTIME_REGISTER';
UPDATE register_templates SET form_code = 'Form 16'   WHERE state_code='AP' AND establishment_type='FACTORY' AND register_type='LEAVE_REGISTER';
-- KA
UPDATE register_templates SET form_code = 'Form 14'   WHERE state_code='KA' AND establishment_type='FACTORY' AND register_type='WAGE_REGISTER';
UPDATE register_templates SET form_code = 'Form 13'   WHERE state_code='KA' AND establishment_type='FACTORY' AND register_type='MUSTER_ROLL';
UPDATE register_templates SET form_code = 'Form 10'   WHERE state_code='KA' AND establishment_type='FACTORY' AND register_type='OVERTIME_REGISTER';
UPDATE register_templates SET form_code = 'Form 15'   WHERE state_code='KA' AND establishment_type='FACTORY' AND register_type='LEAVE_REGISTER';
UPDATE register_templates SET form_code = 'Form U'    WHERE state_code='KA' AND establishment_type='ESTABLISHMENT' AND register_type='WAGE_REGISTER';
UPDATE register_templates SET form_code = 'Form D'    WHERE state_code='KA' AND establishment_type='ESTABLISHMENT' AND register_type='MUSTER_ROLL';
UPDATE register_templates SET form_code = 'Form F'    WHERE state_code='KA' AND establishment_type='ESTABLISHMENT' AND register_type='LEAVE_REGISTER';
-- MH
UPDATE register_templates SET form_code = 'Form 14'   WHERE state_code='MH' AND establishment_type='FACTORY' AND register_type='WAGE_REGISTER';
UPDATE register_templates SET form_code = 'Form 13'   WHERE state_code='MH' AND establishment_type='FACTORY' AND register_type='MUSTER_ROLL';
UPDATE register_templates SET form_code = 'Form 15'   WHERE state_code='MH' AND establishment_type='FACTORY' AND register_type='LEAVE_REGISTER';
UPDATE register_templates SET form_code = 'Form K'    WHERE state_code='MH' AND establishment_type='ESTABLISHMENT' AND register_type='WAGE_REGISTER';
UPDATE register_templates SET form_code = 'Form M'    WHERE state_code='MH' AND establishment_type='ESTABLISHMENT' AND register_type='LEAVE_REGISTER';
-- TN
UPDATE register_templates SET form_code = 'Form 14'   WHERE state_code='TN' AND establishment_type='FACTORY' AND register_type='WAGE_REGISTER';
UPDATE register_templates SET form_code = 'Form 13'   WHERE state_code='TN' AND establishment_type='FACTORY' AND register_type='MUSTER_ROLL';
UPDATE register_templates SET form_code = 'Form 10'   WHERE state_code='TN' AND establishment_type='FACTORY' AND register_type='OVERTIME_REGISTER';
UPDATE register_templates SET form_code = 'Form 15'   WHERE state_code='TN' AND establishment_type='FACTORY' AND register_type='LEAVE_REGISTER';
UPDATE register_templates SET form_code = 'Form R'    WHERE state_code='TN' AND establishment_type='ESTABLISHMENT' AND register_type='WAGE_REGISTER';
-- GJ
UPDATE register_templates SET form_code = 'Form 14'   WHERE state_code='GJ' AND establishment_type='FACTORY' AND register_type='WAGE_REGISTER';
UPDATE register_templates SET form_code = 'Form 13'   WHERE state_code='GJ' AND establishment_type='FACTORY' AND register_type='MUSTER_ROLL';
UPDATE register_templates SET form_code = 'Form 15'   WHERE state_code='GJ' AND establishment_type='FACTORY' AND register_type='LEAVE_REGISTER';
UPDATE register_templates SET form_code = 'Form B'    WHERE state_code='GJ' AND establishment_type='ESTABLISHMENT' AND register_type='WAGE_REGISTER';
UPDATE register_templates SET form_code = 'Form C'    WHERE state_code='GJ' AND establishment_type='ESTABLISHMENT' AND register_type='LEAVE_REGISTER';

-- ─── 3. NEW ALL (NATIONAL DEFAULT) TEMPLATES ───

-- EMPLOYEE_REGISTER (ESTABLISHMENT) — Central Form A
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('ALL', 'ESTABLISHMENT', 'EMPLOYEE_REGISTER',
  'Employee Register (Form A - Central)',
  'Register of employees as per Ease of Compliance Rules, 2017',
  'CODE_ON_WAGES', 'Form A', 'CENTRAL_COMBINED', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Employee Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Spouse Name","source":"FIELD:father_name","width":20},
    {"key":"gender","header":"Gender","source":"FIELD:gender","width":8},
    {"key":"date_of_birth","header":"Date of Birth","source":"FIELD:date_of_birth","width":12},
    {"key":"date_of_joining","header":"Date of Joining","source":"FIELD:date_of_joining","width":12},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"department","header":"Department","source":"FIELD:department","width":14},
    {"key":"aadhaar","header":"Aadhaar No.","source":"FIELD:aadhaar","width":16},
    {"key":"uan","header":"UAN","source":"FIELD:uan","width":14},
    {"key":"esic","header":"ESIC IP No.","source":"FIELD:esic","width":14},
    {"key":"pan","header":"PAN","source":"FIELD:pan","width":12},
    {"key":"phone","header":"Mobile No.","source":"FIELD:phone","width":14},
    {"key":"bank_account","header":"Bank A/c No.","source":"FIELD:bank_account","width":18},
    {"key":"bank_name","header":"Bank Name","source":"FIELD:bank_name","width":16},
    {"key":"ifsc","header":"IFSC Code","source":"FIELD:ifsc","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- ADULT_WORKER_REGISTER (FACTORY) — Central
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('ALL', 'FACTORY', 'ADULT_WORKER_REGISTER',
  'Register of Adult Workers (Factories Act)',
  'Register of adult workers as per Factories Act, 1948',
  'FACTORIES_ACT', NULL, 'CENTRAL_COMBINED', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Employee Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Worker","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"gender","header":"Gender","source":"FIELD:gender","width":8},
    {"key":"date_of_birth","header":"Date of Birth","source":"FIELD:date_of_birth","width":12},
    {"key":"date_of_joining","header":"Date of Joining","source":"FIELD:date_of_joining","width":12},
    {"key":"designation","header":"Nature of Work","source":"FIELD:designation","width":14},
    {"key":"department","header":"Department / Section","source":"FIELD:department","width":14},
    {"key":"uan","header":"UAN","source":"FIELD:uan","width":14},
    {"key":"esic","header":"ESIC IP No.","source":"FIELD:esic","width":14},
    {"key":"aadhaar","header":"Aadhaar No.","source":"FIELD:aadhaar","width":16},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- ACCIDENT_REGISTER (FACTORY)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('ALL', 'FACTORY', 'ACCIDENT_REGISTER',
  'Accident Register (Factories Act)',
  'Register of accidents and dangerous occurrences as per Factories Act, 1948',
  'FACTORIES_ACT', NULL, 'CENTRAL_COMBINED', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Employee Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Worker","source":"FIELD:employee_name","width":24},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"department","header":"Department / Section","source":"FIELD:department","width":14},
    {"key":"date_of_accident","header":"Date of Accident","source":"","width":14},
    {"key":"time_of_accident","header":"Time of Accident","source":"","width":12},
    {"key":"nature_of_injury","header":"Nature of Injury","source":"","width":20},
    {"key":"cause","header":"Cause of Accident","source":"","width":20},
    {"key":"first_aid","header":"First Aid Given","source":"","width":14},
    {"key":"action_taken","header":"Action Taken","source":"","width":18},
    {"key":"days_lost","header":"Days Lost","source":"","width":10},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- GRATUITY_REGISTER (COMMON)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('ALL', 'COMMON', 'GRATUITY_REGISTER',
  'Gratuity Register (Payment of Gratuity Act)',
  'Register of gratuity as per Payment of Gratuity Act, 1972. Applicable where 10+ employees.',
  'SOCIAL_SECURITY', NULL, 'CENTRAL_COMBINED', 'ANNUAL', '{"min_employees": 10}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"date_of_joining","header":"Date of Joining","source":"FIELD:date_of_joining","width":12},
    {"key":"basic","header":"Basic Wages (Rs.)","source":"COMP:BASIC","width":12},
    {"key":"gross_earnings","header":"Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"years_of_service","header":"Years of Service","source":"","width":12},
    {"key":"gratuity_amount","header":"Gratuity Amount (Rs.)","source":"","width":14},
    {"key":"nomination_details","header":"Nomination Details","source":"","width":18},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- CONTRACTOR_REGISTER (COMMON) — CLRA
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('ALL', 'COMMON', 'CONTRACTOR_REGISTER',
  'Contract Labour Register (CLRA Act)',
  'Register of contract labourers as per CLRA Act, 1970. Applicable where 20+ contract workers.',
  'CLRA', NULL, 'CENTRAL_COMBINED', 'MONTHLY', '{"min_contractors": 20}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Workman","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Nature of Work","source":"FIELD:designation","width":14},
    {"key":"contractor_name","header":"Contractor Name","source":"","width":20},
    {"key":"work_order","header":"Work Order No.","source":"","width":14},
    {"key":"days_present","header":"Days Worked","source":"FIELD:days_present","width":10},
    {"key":"basic","header":"Basic Wages (Rs.)","source":"COMP:BASIC","width":12},
    {"key":"gross_earnings","header":"Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"total_deductions","header":"Total Deductions (Rs.)","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Pay (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"signature","header":"Signature","source":"","width":18}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- MATERNITY_REGISTER (COMMON)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('ALL', 'COMMON', 'MATERNITY_REGISTER',
  'Maternity Benefit Register',
  'Register of maternity benefit as per Maternity Benefit Act, 1961',
  'MATERNITY_BENEFIT', NULL, 'CENTRAL_COMBINED', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Woman","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"department","header":"Department","source":"FIELD:department","width":14},
    {"key":"date_of_joining","header":"Date of Joining","source":"FIELD:date_of_joining","width":12},
    {"key":"date_of_notice","header":"Date of Notice","source":"","width":12},
    {"key":"expected_delivery","header":"Expected Delivery Date","source":"","width":14},
    {"key":"leave_from","header":"Leave From","source":"","width":12},
    {"key":"leave_to","header":"Leave To","source":"","width":12},
    {"key":"actual_delivery","header":"Actual Delivery Date","source":"","width":14},
    {"key":"maternity_pay","header":"Maternity Benefit Paid (Rs.)","source":"","width":14},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- FINE_REGISTER (COMMON)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('ALL', 'COMMON', 'FINE_REGISTER',
  'Register of Fines (Payment of Wages Act)',
  'Register of fines imposed under Payment of Wages Act, 1936',
  'CODE_ON_WAGES', 'Form C', 'CENTRAL_COMBINED', 'MONTHLY', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"act_or_omission","header":"Act / Omission for which Fine Imposed","source":"","width":22},
    {"key":"show_cause_date","header":"Date of Show Cause Notice","source":"","width":14},
    {"key":"fine_amount","header":"Amount of Fine (Rs.)","source":"","width":12},
    {"key":"date_of_recovery","header":"Date of Recovery","source":"","width":14},
    {"key":"total_recovered","header":"Total Recovered (Rs.)","source":"","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- ADVANCE_REGISTER (COMMON)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('ALL', 'COMMON', 'ADVANCE_REGISTER',
  'Register of Advances (Payment of Wages Act)',
  'Register of advances / loans as per Ease of Compliance Rules Form C',
  'CODE_ON_WAGES', 'Form C', 'CENTRAL_COMBINED', 'MONTHLY', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"date_of_advance","header":"Date of Advance","source":"","width":14},
    {"key":"amount_advanced","header":"Amount of Advance (Rs.)","source":"","width":14},
    {"key":"purpose","header":"Purpose","source":"","width":18},
    {"key":"instalments","header":"No. of Instalments","source":"","width":12},
    {"key":"instalment_amount","header":"Instalment Amount (Rs.)","source":"","width":14},
    {"key":"total_recovered","header":"Total Recovered (Rs.)","source":"","width":12},
    {"key":"balance","header":"Balance Outstanding (Rs.)","source":"","width":14},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- EQUAL_REMUNERATION_REGISTER (COMMON)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('ALL', 'COMMON', 'EQUAL_REMUNERATION_REGISTER',
  'Equal Remuneration Register',
  'Gender-wise wage register as per Equal Remuneration Act, 1976',
  'CODE_ON_WAGES', NULL, 'CENTRAL_COMBINED', 'ANNUAL', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"gender","header":"Gender","source":"FIELD:gender","width":8},
    {"key":"designation","header":"Designation / Nature of Work","source":"FIELD:designation","width":18},
    {"key":"department","header":"Department","source":"FIELD:department","width":14},
    {"key":"basic","header":"Basic Wages (Rs.)","source":"COMP:BASIC","width":12},
    {"key":"gross_earnings","header":"Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"net_pay","header":"Net Pay (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"date_of_joining","header":"Date of Joining","source":"FIELD:date_of_joining","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- ─── 4. STATE: TELANGANA (TS) — NEW REGISTER TYPES ───

-- TS FACTORY: Adult Worker Register (Form 13)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('TS', 'FACTORY', 'ADULT_WORKER_REGISTER',
  'Register of Adult Workers (Form 13 - Telangana Factories Rules)',
  'Register of adult workers as per Telangana Factories Rules',
  'FACTORIES_ACT', 'Form 13', 'STATE_NEW', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Worker","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"gender","header":"Sex","source":"FIELD:gender","width":8},
    {"key":"date_of_birth","header":"Date of Birth","source":"FIELD:date_of_birth","width":12},
    {"key":"date_of_joining","header":"Date of Entry","source":"FIELD:date_of_joining","width":12},
    {"key":"designation","header":"Nature of Work","source":"FIELD:designation","width":14},
    {"key":"department","header":"Department / Section","source":"FIELD:department","width":14},
    {"key":"uan","header":"UAN","source":"FIELD:uan","width":14},
    {"key":"esic","header":"ESIC IP No.","source":"FIELD:esic","width":14},
    {"key":"aadhaar","header":"Aadhaar No.","source":"FIELD:aadhaar","width":16},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- TS FACTORY: Accident Register (Form 26)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('TS', 'FACTORY', 'ACCIDENT_REGISTER',
  'Accident Register (Form 26 - Telangana Factories Rules)',
  'Register of accidents and dangerous occurrences',
  'FACTORIES_ACT', 'Form 26', 'STATE_NEW', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Worker","source":"FIELD:employee_name","width":24},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"department","header":"Department / Section","source":"FIELD:department","width":14},
    {"key":"date_of_accident","header":"Date of Accident","source":"","width":14},
    {"key":"time_of_accident","header":"Time of Accident","source":"","width":12},
    {"key":"nature_of_injury","header":"Nature of Injury","source":"","width":20},
    {"key":"cause","header":"Cause of Accident","source":"","width":20},
    {"key":"first_aid","header":"First Aid Given","source":"","width":14},
    {"key":"action_taken","header":"Action Taken","source":"","width":18},
    {"key":"days_lost","header":"Days Lost","source":"","width":10},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- TS ESTABLISHMENT: Employee Register (Form V - TS S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('TS', 'ESTABLISHMENT', 'EMPLOYEE_REGISTER',
  'Employee Register (Form V - Telangana S&E Act)',
  'Register of employees under Telangana Shops & Establishments Act',
  'SHOPS_ESTABLISHMENTS', 'Form V', 'STATE_NEW', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Employee Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Person Employed","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"gender","header":"Sex","source":"FIELD:gender","width":8},
    {"key":"date_of_birth","header":"Date of Birth / Age","source":"FIELD:date_of_birth","width":12},
    {"key":"date_of_joining","header":"Date of Entry into Service","source":"FIELD:date_of_joining","width":12},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"department","header":"Department","source":"FIELD:department","width":14},
    {"key":"aadhaar","header":"Aadhaar No.","source":"FIELD:aadhaar","width":16},
    {"key":"uan","header":"UAN","source":"FIELD:uan","width":14},
    {"key":"esic","header":"ESIC IP No.","source":"FIELD:esic","width":14},
    {"key":"phone","header":"Mobile No.","source":"FIELD:phone","width":14},
    {"key":"bank_account","header":"Bank A/c No.","source":"FIELD:bank_account","width":18},
    {"key":"ifsc","header":"IFSC Code","source":"FIELD:ifsc","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- ─── 5. STATE: ANDHRA PRADESH (AP) — NEW REGISTER TYPES ───

-- AP FACTORY: Adult Worker Register (Form 13)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('AP', 'FACTORY', 'ADULT_WORKER_REGISTER',
  'Register of Adult Workers (Form 13 - AP Factory Rules)',
  'Register of adult workers as per Andhra Pradesh Factories Rules',
  'FACTORIES_ACT', 'Form 13', 'STATE_NEW', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Worker","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"gender","header":"Sex","source":"FIELD:gender","width":8},
    {"key":"date_of_birth","header":"Date of Birth","source":"FIELD:date_of_birth","width":12},
    {"key":"date_of_joining","header":"Date of Entry","source":"FIELD:date_of_joining","width":12},
    {"key":"designation","header":"Nature of Work","source":"FIELD:designation","width":14},
    {"key":"department","header":"Department / Section","source":"FIELD:department","width":14},
    {"key":"uan","header":"UAN","source":"FIELD:uan","width":14},
    {"key":"esic","header":"ESIC IP No.","source":"FIELD:esic","width":14},
    {"key":"aadhaar","header":"Aadhaar No.","source":"FIELD:aadhaar","width":16},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- AP FACTORY: Accident Register (Form 26)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('AP', 'FACTORY', 'ACCIDENT_REGISTER',
  'Accident Register (Form 26 - AP Factory Rules)',
  'Register of accidents and dangerous occurrences',
  'FACTORIES_ACT', 'Form 26', 'STATE_NEW', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Worker","source":"FIELD:employee_name","width":24},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"department","header":"Department / Section","source":"FIELD:department","width":14},
    {"key":"date_of_accident","header":"Date of Accident","source":"","width":14},
    {"key":"nature_of_injury","header":"Nature of Injury","source":"","width":20},
    {"key":"cause","header":"Cause of Accident","source":"","width":20},
    {"key":"first_aid","header":"First Aid Given","source":"","width":14},
    {"key":"action_taken","header":"Action Taken","source":"","width":18},
    {"key":"days_lost","header":"Days Lost","source":"","width":10},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- AP ESTABLISHMENT: Employee Register (Form V - AP S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('AP', 'ESTABLISHMENT', 'EMPLOYEE_REGISTER',
  'Employee Register (Form V - AP S&E Act)',
  'Register of employees under Andhra Pradesh Shops & Establishments Act',
  'SHOPS_ESTABLISHMENTS', 'Form V', 'STATE_NEW', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Employee Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Person Employed","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"gender","header":"Sex","source":"FIELD:gender","width":8},
    {"key":"date_of_birth","header":"Date of Birth / Age","source":"FIELD:date_of_birth","width":12},
    {"key":"date_of_joining","header":"Date of Entry into Service","source":"FIELD:date_of_joining","width":12},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"department","header":"Department","source":"FIELD:department","width":14},
    {"key":"aadhaar","header":"Aadhaar No.","source":"FIELD:aadhaar","width":16},
    {"key":"uan","header":"UAN","source":"FIELD:uan","width":14},
    {"key":"esic","header":"ESIC IP No.","source":"FIELD:esic","width":14},
    {"key":"phone","header":"Mobile No.","source":"FIELD:phone","width":14},
    {"key":"bank_account","header":"Bank A/c No.","source":"FIELD:bank_account","width":18},
    {"key":"ifsc","header":"IFSC Code","source":"FIELD:ifsc","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- ─── 6. STATE: KARNATAKA (KA) — NEW REGISTER TYPES ───

-- KA FACTORY: Adult Worker Register (Form 12)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('KA', 'FACTORY', 'ADULT_WORKER_REGISTER',
  'Register of Adult Workers (Form 12 - Karnataka Factory Rules)',
  'Register of adult workers under Karnataka Factories Rules',
  'FACTORIES_ACT', 'Form 12', 'HYBRID', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Worker","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"gender","header":"Sex","source":"FIELD:gender","width":8},
    {"key":"date_of_birth","header":"Date of Birth","source":"FIELD:date_of_birth","width":12},
    {"key":"date_of_joining","header":"Date of Entry","source":"FIELD:date_of_joining","width":12},
    {"key":"designation","header":"Nature of Work / Process","source":"FIELD:designation","width":16},
    {"key":"department","header":"Department / Group","source":"FIELD:department","width":14},
    {"key":"aadhaar","header":"Aadhaar No.","source":"FIELD:aadhaar","width":16},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- KA ESTABLISHMENT: Employee Register (Form T - KA S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('KA', 'ESTABLISHMENT', 'EMPLOYEE_REGISTER',
  'Employee Register (Form T - Karnataka S&E Act)',
  'Register of employees under Karnataka Shops & Establishments Act',
  'SHOPS_ESTABLISHMENTS', 'Form T', 'HYBRID', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Employee Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Person Employed","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"gender","header":"Sex","source":"FIELD:gender","width":8},
    {"key":"date_of_birth","header":"Date of Birth","source":"FIELD:date_of_birth","width":12},
    {"key":"date_of_joining","header":"Date of Joining","source":"FIELD:date_of_joining","width":12},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"department","header":"Department","source":"FIELD:department","width":14},
    {"key":"aadhaar","header":"Aadhaar No.","source":"FIELD:aadhaar","width":16},
    {"key":"uan","header":"UAN","source":"FIELD:uan","width":14},
    {"key":"esic","header":"ESIC IP No.","source":"FIELD:esic","width":14},
    {"key":"phone","header":"Mobile No.","source":"FIELD:phone","width":14},
    {"key":"bank_account","header":"Bank A/c No.","source":"FIELD:bank_account","width":18},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- ─── 7. STATE: MAHARASHTRA (MH) — NEW REGISTER TYPES ───

-- MH FACTORY: Adult Worker Register (Form 12)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('MH', 'FACTORY', 'ADULT_WORKER_REGISTER',
  'Register of Adult Workers (Form 12 - Maharashtra Factory Rules)',
  'Register of adult workers under Maharashtra Factories Rules',
  'FACTORIES_ACT', 'Form 12', 'STATE_NEW', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Worker","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"gender","header":"Sex","source":"FIELD:gender","width":8},
    {"key":"date_of_birth","header":"Date of Birth","source":"FIELD:date_of_birth","width":12},
    {"key":"date_of_joining","header":"Date of Joining","source":"FIELD:date_of_joining","width":12},
    {"key":"designation","header":"Nature of Work","source":"FIELD:designation","width":14},
    {"key":"department","header":"Department / Section","source":"FIELD:department","width":14},
    {"key":"aadhaar","header":"Aadhaar No.","source":"FIELD:aadhaar","width":16},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- MH ESTABLISHMENT: Employee Register (Form J - MH S&E Act 2017)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('MH', 'ESTABLISHMENT', 'EMPLOYEE_REGISTER',
  'Employee Register (Form J - Maharashtra S&E Act)',
  'Register of employees under Maharashtra Shops & Establishments Act, 2017',
  'SHOPS_ESTABLISHMENTS', 'Form J', 'STATE_NEW', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Employee Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Person Employed","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"gender","header":"Sex","source":"FIELD:gender","width":8},
    {"key":"date_of_birth","header":"Date of Birth","source":"FIELD:date_of_birth","width":12},
    {"key":"date_of_joining","header":"Date of Joining","source":"FIELD:date_of_joining","width":12},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"department","header":"Department","source":"FIELD:department","width":14},
    {"key":"aadhaar","header":"Aadhaar No.","source":"FIELD:aadhaar","width":16},
    {"key":"uan","header":"UAN","source":"FIELD:uan","width":14},
    {"key":"esic","header":"ESIC IP No.","source":"FIELD:esic","width":14},
    {"key":"phone","header":"Mobile No.","source":"FIELD:phone","width":14},
    {"key":"bank_account","header":"Bank A/c No.","source":"FIELD:bank_account","width":18},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- ─── 8. STATE: TAMIL NADU (TN) — NEW REGISTER TYPES ───

-- TN FACTORY: Adult Worker Register (Form 12)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('TN', 'FACTORY', 'ADULT_WORKER_REGISTER',
  'Register of Adult Workers (Form 12 - Tamil Nadu Factory Rules)',
  'Register of adult workers under Tamil Nadu Factories Rules',
  'FACTORIES_ACT', 'Form 12', 'HYBRID', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Worker","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"gender","header":"Sex","source":"FIELD:gender","width":8},
    {"key":"date_of_birth","header":"Date of Birth","source":"FIELD:date_of_birth","width":12},
    {"key":"date_of_joining","header":"Date of Entry","source":"FIELD:date_of_joining","width":12},
    {"key":"designation","header":"Nature of Work / Process","source":"FIELD:designation","width":16},
    {"key":"department","header":"Department / Group","source":"FIELD:department","width":14},
    {"key":"aadhaar","header":"Aadhaar No.","source":"FIELD:aadhaar","width":16},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- TN ESTABLISHMENT: Employee Register (Form Q - TN S&E Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('TN', 'ESTABLISHMENT', 'EMPLOYEE_REGISTER',
  'Register of Employment (Form Q - Tamil Nadu S&E Rules)',
  'Register of employment as per Tamil Nadu Shops & Establishments Rules',
  'SHOPS_ESTABLISHMENTS', 'Form Q', 'HYBRID', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Employee Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Person Employed","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"date_of_birth","header":"Age / Date of Birth","source":"FIELD:date_of_birth","width":12},
    {"key":"date_of_joining","header":"Date of Entry into Service","source":"FIELD:date_of_joining","width":14},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"department","header":"Department","source":"FIELD:department","width":14},
    {"key":"total_days","header":"Daily Hours of Work (incl. OT)","source":"FIELD:total_days","width":12},
    {"key":"ot_hours","header":"Total Hours of OT Worked","source":"FIELD:ot_hours","width":12},
    {"key":"phone","header":"Mobile No.","source":"FIELD:phone","width":14},
    {"key":"aadhaar","header":"Aadhaar No.","source":"FIELD:aadhaar","width":16},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- TN ESTABLISHMENT: Deductions Register override (Form P - TN S&E Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('TN', 'ESTABLISHMENT', 'DEDUCTION_REGISTER',
  'Register of Fines, Deductions & Advances (Form P - TN S&E Rules)',
  'Register of fines, deductions for damages/loss, and advances as per TN S&E Rules',
  'CODE_ON_WAGES', 'Form P', 'HYBRID', 'MONTHLY', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp No.","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Person Employed","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"pf_emp","header":"PF Deduction (Rs.)","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI Deduction (Rs.)","source":"STAT:ESI_EMP","width":12},
    {"key":"pt","header":"Professional Tax (Rs.)","source":"STAT:PT","width":10},
    {"key":"total_deductions","header":"Total Deductions (Rs.)","source":"CALC:total_deductions","width":14},
    {"key":"fine_details","header":"Act / Omission & Fine","source":"","width":18},
    {"key":"advance_details","header":"Advance / Loan Details","source":"","width":18},
    {"key":"signature","header":"Signature / Thumb Impression","source":"","width":16},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description,
  law_family = EXCLUDED.law_family, form_code = EXCLUDED.form_code,
  register_mode = EXCLUDED.register_mode, column_definitions = EXCLUDED.column_definitions;

-- ─── 9. STATE: GUJARAT (GJ) — NEW REGISTER TYPES ───

-- GJ FACTORY: Adult Worker Register (Form 12)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('GJ', 'FACTORY', 'ADULT_WORKER_REGISTER',
  'Register of Adult Workers (Form 12 - Gujarat Factory Rules)',
  'Register of adult workers under Gujarat Factories Rules',
  'FACTORIES_ACT', 'Form 12', 'HYBRID', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Worker","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"gender","header":"Sex","source":"FIELD:gender","width":8},
    {"key":"date_of_birth","header":"Date of Birth","source":"FIELD:date_of_birth","width":12},
    {"key":"date_of_joining","header":"Date of Entry","source":"FIELD:date_of_joining","width":12},
    {"key":"designation","header":"Nature of Work","source":"FIELD:designation","width":14},
    {"key":"department","header":"Department / Section","source":"FIELD:department","width":14},
    {"key":"aadhaar","header":"Aadhaar No.","source":"FIELD:aadhaar","width":16},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- GJ ESTABLISHMENT: Employee Register (Form A - GJ S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('GJ', 'ESTABLISHMENT', 'EMPLOYEE_REGISTER',
  'Employee Register (Form A - Gujarat S&E Act)',
  'Register of employees under Gujarat Shops & Establishments Act',
  'SHOPS_ESTABLISHMENTS', 'Form A', 'HYBRID', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Employee Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Person Employed","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"gender","header":"Sex","source":"FIELD:gender","width":8},
    {"key":"date_of_birth","header":"Date of Birth","source":"FIELD:date_of_birth","width":12},
    {"key":"date_of_joining","header":"Date of Joining","source":"FIELD:date_of_joining","width":12},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"department","header":"Department","source":"FIELD:department","width":14},
    {"key":"aadhaar","header":"Aadhaar No.","source":"FIELD:aadhaar","width":16},
    {"key":"uan","header":"UAN","source":"FIELD:uan","width":14},
    {"key":"esic","header":"ESIC IP No.","source":"FIELD:esic","width":14},
    {"key":"phone","header":"Mobile No.","source":"FIELD:phone","width":14},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- ─── 10. STATE: HARYANA (HR) — ALL REGISTER TYPES ───

-- HR FACTORY: Wage Register (Form 14)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('HR', 'FACTORY', 'WAGE_REGISTER',
  'Wage Register (Form 14 - Haryana Factory Rules)',
  'Monthly wage register as prescribed under Haryana Factories Rules',
  'CODE_ON_WAGES', 'Form 14', 'HYBRID', 'MONTHLY', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"days_present","header":"No. of Days Worked","source":"FIELD:days_present","width":10},
    {"key":"basic","header":"Basic Wages (Rs.)","source":"COMP:BASIC","width":12},
    {"key":"hra","header":"HRA (Rs.)","source":"COMP:HRA","width":10},
    {"key":"other_allowances","header":"Other Allowances (Rs.)","source":"COMP:OTHERS","width":14},
    {"key":"gross_earnings","header":"Total Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pf_emp","header":"PF (Rs.)","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI (Rs.)","source":"STAT:ESI_EMP","width":12},
    {"key":"pt","header":"Prof. Tax (Rs.)","source":"STAT:PT","width":10},
    {"key":"total_deductions","header":"Total Deductions (Rs.)","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Wages Payable (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"signature","header":"Signature","source":"","width":18}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- HR FACTORY: Muster Roll (Form 13)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('HR', 'FACTORY', 'MUSTER_ROLL',
  'Muster Roll (Form 13 - Haryana Factory Rules)',
  'Monthly attendance muster roll as per Haryana Factories Rules',
  'CODE_ON_WAGES', 'Form 13', 'HYBRID', 'MONTHLY', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation / Dept.","source":"FIELD:designation","width":15},
    {"key":"total_days","header":"Total Days in Month","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Present","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Days Absent (LOP)","source":"FIELD:lop_days","width":12},
    {"key":"ncp_days","header":"NCP Days","source":"FIELD:ncp_days","width":10},
    {"key":"ot_hours","header":"Overtime Hours","source":"FIELD:ot_hours","width":10},
    {"key":"gross_earnings","header":"Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- HR FACTORY: Leave Register (Form 15)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('HR', 'FACTORY', 'LEAVE_REGISTER',
  'Leave with Wages Register (Form 15 - Haryana Factory Rules)',
  'Register of leave with wages under Haryana Factories Rules',
  'CODE_ON_WAGES', 'Form 15', 'HYBRID', 'MONTHLY', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days in Month","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Worked","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Leave Without Pay","source":"FIELD:lop_days","width":12},
    {"key":"ncp_days","header":"NCP Days","source":"FIELD:ncp_days","width":10},
    {"key":"basic","header":"Basic Wages (Rs.)","source":"COMP:BASIC","width":12},
    {"key":"net_pay","header":"Net Pay (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- HR FACTORY: Overtime Register
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('HR', 'FACTORY', 'OVERTIME_REGISTER',
  'Overtime Register (Haryana Factory Rules)',
  'Register of overtime work under Haryana Factories Rules',
  'CODE_ON_WAGES', NULL, 'HYBRID', 'MONTHLY', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"days_present","header":"No. of Days Worked","source":"FIELD:days_present","width":10},
    {"key":"ot_hours","header":"Total OT Hours","source":"FIELD:ot_hours","width":14},
    {"key":"basic","header":"Normal Rate of Wages (Rs.)","source":"COMP:BASIC","width":14},
    {"key":"gross_earnings","header":"Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"net_pay","header":"Net Wages (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- HR FACTORY: Adult Worker Register (Form 12)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('HR', 'FACTORY', 'ADULT_WORKER_REGISTER',
  'Register of Adult Workers (Form 12 - Haryana Factory Rules)',
  'Register of adult workers under Haryana Factories Rules',
  'FACTORIES_ACT', 'Form 12', 'HYBRID', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Worker","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"gender","header":"Sex","source":"FIELD:gender","width":8},
    {"key":"date_of_birth","header":"Date of Birth","source":"FIELD:date_of_birth","width":12},
    {"key":"date_of_joining","header":"Date of Entry","source":"FIELD:date_of_joining","width":12},
    {"key":"designation","header":"Nature of Work","source":"FIELD:designation","width":14},
    {"key":"department","header":"Department / Section","source":"FIELD:department","width":14},
    {"key":"aadhaar","header":"Aadhaar No.","source":"FIELD:aadhaar","width":16},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- HR ESTABLISHMENT: Employee Register (Form C - Punjab/Haryana S&E Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('HR', 'ESTABLISHMENT', 'EMPLOYEE_REGISTER',
  'Register of Employees (Form C - Haryana S&E Rules)',
  'Register of employees under Punjab Shops & Commercial Establishments Rules (Haryana)',
  'SHOPS_ESTABLISHMENTS', 'Form C', 'HYBRID', 'EVENT_BASED', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Employee Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"gender","header":"Sex","source":"FIELD:gender","width":8},
    {"key":"date_of_birth","header":"Date of Birth","source":"FIELD:date_of_birth","width":12},
    {"key":"date_of_joining","header":"Date of Appointment","source":"FIELD:date_of_joining","width":12},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"department","header":"Department","source":"FIELD:department","width":14},
    {"key":"aadhaar","header":"Aadhaar No.","source":"FIELD:aadhaar","width":16},
    {"key":"uan","header":"UAN","source":"FIELD:uan","width":14},
    {"key":"esic","header":"ESIC IP No.","source":"FIELD:esic","width":14},
    {"key":"phone","header":"Mobile No.","source":"FIELD:phone","width":14},
    {"key":"bank_account","header":"Bank A/c No.","source":"FIELD:bank_account","width":18},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- HR ESTABLISHMENT: Wage Register (Form D)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('HR', 'ESTABLISHMENT', 'WAGE_REGISTER',
  'Wage Register (Form D - Haryana S&E Rules)',
  'Register of wages under Punjab Shops & Commercial Establishments Rules (Haryana)',
  'CODE_ON_WAGES', 'Form D', 'HYBRID', 'MONTHLY', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"days_present","header":"No. of Days Worked","source":"FIELD:days_present","width":10},
    {"key":"basic","header":"Basic Wages (Rs.)","source":"COMP:BASIC","width":12},
    {"key":"hra","header":"HRA (Rs.)","source":"COMP:HRA","width":10},
    {"key":"other_allowances","header":"Other Allowances (Rs.)","source":"COMP:OTHERS","width":14},
    {"key":"gross_earnings","header":"Total Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pf_emp","header":"PF (Rs.)","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI (Rs.)","source":"STAT:ESI_EMP","width":12},
    {"key":"pt","header":"Prof. Tax (Rs.)","source":"STAT:PT","width":10},
    {"key":"total_deductions","header":"Total Deductions (Rs.)","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Wages Payable (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"signature","header":"Signature","source":"","width":18}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- HR ESTABLISHMENT: Muster Roll
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('HR', 'ESTABLISHMENT', 'MUSTER_ROLL',
  'Attendance Register (Haryana S&E Rules)',
  'Attendance register under Haryana Shops & Establishments framework',
  'CODE_ON_WAGES', NULL, 'HYBRID', 'MONTHLY', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation / Dept.","source":"FIELD:designation","width":15},
    {"key":"total_days","header":"Total Days in Month","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Present","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Days Absent (LOP)","source":"FIELD:lop_days","width":12},
    {"key":"ncp_days","header":"NCP Days","source":"FIELD:ncp_days","width":10},
    {"key":"ot_hours","header":"Overtime Hours","source":"FIELD:ot_hours","width":10},
    {"key":"gross_earnings","header":"Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- HR ESTABLISHMENT: Leave Register
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('HR', 'ESTABLISHMENT', 'LEAVE_REGISTER',
  'Leave Register (Haryana S&E Rules)',
  'Leave register under Haryana Shops & Establishments framework',
  'CODE_ON_WAGES', NULL, 'HYBRID', 'MONTHLY', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Worked","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Leave Without Pay","source":"FIELD:lop_days","width":12},
    {"key":"ncp_days","header":"NCP Days","source":"FIELD:ncp_days","width":10},
    {"key":"basic","header":"Basic Wages (Rs.)","source":"COMP:BASIC","width":12},
    {"key":"net_pay","header":"Net Pay (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- HR ESTABLISHMENT: Deductions Register (Form E)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('HR', 'ESTABLISHMENT', 'DEDUCTION_REGISTER',
  'Register of Deductions (Form E - Haryana S&E Rules)',
  'Register of deductions under Haryana Shops & Establishments framework',
  'CODE_ON_WAGES', 'Form E', 'HYBRID', 'MONTHLY', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"gross_earnings","header":"Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pf_emp","header":"PF (Rs.)","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI (Rs.)","source":"STAT:ESI_EMP","width":12},
    {"key":"pt","header":"Prof. Tax (Rs.)","source":"STAT:PT","width":10},
    {"key":"total_deductions","header":"Total Deductions (Rs.)","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Pay (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description,
  law_family = EXCLUDED.law_family, form_code = EXCLUDED.form_code,
  register_mode = EXCLUDED.register_mode, column_definitions = EXCLUDED.column_definitions;

-- HR COMMON: PT Register
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, law_family, form_code, register_mode, frequency, applies_when, column_definitions)
VALUES ('HR', 'COMMON', 'PT_REGISTER',
  'Professional Tax Register (Haryana)',
  'Professional tax register for Haryana',
  'STATE_TAX', NULL, 'HYBRID', 'MONTHLY', '{}'::jsonb,
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"gross_earnings","header":"Gross Salary (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pt","header":"Professional Tax (Rs.)","source":"STAT:PT","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- ─── 11. UPDATE EXISTING STATE TEMPLATES WITH NEW METADATA ───

-- Set register_mode for HR
UPDATE register_templates SET register_mode = 'HYBRID' WHERE state_code = 'HR';

-- Ensure law_family is set for all templates that still have NULL
UPDATE register_templates SET law_family = 'CODE_ON_WAGES'
  WHERE law_family IS NULL AND register_type IN ('WAGE_REGISTER','MUSTER_ROLL','OVERTIME_REGISTER','LEAVE_REGISTER','DEDUCTION_REGISTER');
UPDATE register_templates SET law_family = 'SOCIAL_SECURITY'
  WHERE law_family IS NULL AND register_type IN ('PF_REGISTER','ESI_REGISTER');
UPDATE register_templates SET law_family = 'STATE_TAX'
  WHERE law_family IS NULL AND register_type = 'PT_REGISTER';
UPDATE register_templates SET law_family = 'BONUS_ACT'
  WHERE law_family IS NULL AND register_type = 'BONUS_REGISTER';
UPDATE register_templates SET law_family = 'FACTORIES_ACT'
  WHERE law_family IS NULL AND register_type IN ('ADULT_WORKER_REGISTER','ACCIDENT_REGISTER');
UPDATE register_templates SET law_family = 'SHOPS_ESTABLISHMENTS'
  WHERE law_family IS NULL AND register_type = 'EMPLOYEE_REGISTER';
UPDATE register_templates SET law_family = 'SOCIAL_SECURITY'
  WHERE law_family IS NULL AND register_type = 'GRATUITY_REGISTER';
UPDATE register_templates SET law_family = 'CLRA'
  WHERE law_family IS NULL AND register_type = 'CONTRACTOR_REGISTER';
UPDATE register_templates SET law_family = 'MATERNITY_BENEFIT'
  WHERE law_family IS NULL AND register_type = 'MATERNITY_REGISTER';
UPDATE register_templates SET law_family = 'CODE_ON_WAGES'
  WHERE law_family IS NULL AND register_type IN ('FINE_REGISTER','ADVANCE_REGISTER','EQUAL_REMUNERATION_REGISTER');

-- Ensure frequency is set correctly
UPDATE register_templates SET frequency = 'EVENT_BASED'
  WHERE register_type IN ('EMPLOYEE_REGISTER','ADULT_WORKER_REGISTER','ACCIDENT_REGISTER','MATERNITY_REGISTER');
UPDATE register_templates SET frequency = 'ANNUAL'
  WHERE register_type IN ('BONUS_REGISTER','GRATUITY_REGISTER','EQUAL_REMUNERATION_REGISTER');
