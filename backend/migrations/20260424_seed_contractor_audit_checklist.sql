-- Monthly Audit Checklist items for Contractor compliance
-- Sourced from user-provided audit checklist (Contract Labour, PF, ESI, Bonus Act)
-- All inserted as compliance_master records under law_family = 'CONTRACTOR_AUDIT'

INSERT INTO compliance_master (code, compliance_name, law_name, law_family, state_scope, min_headcount, max_headcount, frequency, description, is_active)
VALUES
  -- General Info
  ('CLRA_EMP_COUNT',          'Number of Employees',                                  'Contract Labour (R&A) Act, 1970',            'CONTRACTOR_AUDIT', 'ALL', NULL, NULL, 'MONTHLY',      'Record of total number of employees deployed at workcentre', true),
  ('CLRA_NATURE_WORK',        'Nature of Work',                                       'Contract Labour (R&A) Act, 1970',            'CONTRACTOR_AUDIT', 'ALL', NULL, NULL, 'YEARLY',       'Description of nature of contract work being carried out', true),

  -- Section I: License Details
  ('CLRA_LIC_VALIDITY',       'License Validity (CLRA)',                              'Contract Labour (R&A) Act, 1970',            'CONTRACTOR_AUDIT', 'ALL', NULL, NULL, 'YEARLY',       'Valid licence under Contract Labour Act with current validity dates', true),
  ('CLRA_LIC_WORKCENTRE',     'License - Workcentre Address',                         'Contract Labour (R&A) Act, 1970',            'CONTRACTOR_AUDIT', 'ALL', NULL, NULL, 'YEARLY',       'Workcentre address as stated on CLRA licence', true),

  -- Section II: Agreement & Registers
  ('CLRA_AGREEMENT',          'Agreement (Principal Employer - Contractor)',           'Contract Labour (R&A) Act, 1970',            'CONTRACTOR_AUDIT', 'ALL', NULL, NULL, 'YEARLY',       'Signed agreement between contractor and principal employer', true),
  ('CLRA_REG_MUSTEROLL',      'Register of Muster Roll (Form XVI)',                   'Contract Labour (R&A) Act, 1970',            'CONTRACTOR_AUDIT', 'ALL', NULL, NULL, 'MONTHLY',      'Monthly muster roll register maintained as per CLRA rules', true),
  ('CLRA_REG_WAGES',          'Register of Wages (Form XVII)',                        'Contract Labour (R&A) Act, 1970',            'CONTRACTOR_AUDIT', 'ALL', NULL, NULL, 'MONTHLY',      'Monthly wages register for all contract workers', true),
  ('CLRA_REG_FINES',          'Register of Fines (Form I)',                           'Payment of Wages Act, 1936',                 'CONTRACTOR_AUDIT', 'ALL', NULL, NULL, 'MONTHLY',      'Register of fines imposed on workers', true),
  ('CLRA_REG_DEDUCTIONS',     'Register of Deductions for Damage (Form II)',          'Payment of Wages Act, 1936',                 'CONTRACTOR_AUDIT', 'ALL', NULL, NULL, 'MONTHLY',      'Register of deductions made for damage or loss caused by employees', true),
  ('CLRA_REG_ADVANCES',       'Register of Advances (Form III)',                      'Payment of Wages Act, 1936',                 'CONTRACTOR_AUDIT', 'ALL', NULL, NULL, 'MONTHLY',      'Register of advances paid to workers', true),
  ('CLRA_REG_OVERTIME',       'Register of Overtime',                                 'Contract Labour (R&A) Act, 1970',            'CONTRACTOR_AUDIT', 'ALL', NULL, NULL, 'MONTHLY',      'Monthly overtime register for contract workers', true),
  ('CLRA_FORM13',             'Register of Employment (Form XIII / Form-13)',          'Contract Labour (R&A) Act, 1970',            'CONTRACTOR_AUDIT', 'ALL', NULL, NULL, 'MONTHLY',      'Register of persons employed as contract workers', true),
  ('CLRA_FORM14_RETURNS',     'Half Yearly Returns (Form XXIV under CLRA)',            'Contract Labour (R&A) Act, 1970',            'CONTRACTOR_AUDIT', 'ALL', NULL, NULL, 'HALF_YEARLY',  'Half yearly return to be submitted to licensing authority', true),
  ('CLRA_WAGE_SLIPS',         'Wage Slips',                                           'Payment of Wages Act, 1936',                 'CONTRACTOR_AUDIT', 'ALL', NULL, NULL, 'MONTHLY',      'Monthly wage slips issued to each contract worker', true),
  ('CLRA_EMP_CARDS',          'Employment Cards',                                     'Contract Labour (R&A) Act, 1970',            'CONTRACTOR_AUDIT', 'ALL', NULL, NULL, 'MONTHLY',      'Employment cards issued to each contract worker', true),
  ('CLRA_FORM6A',             'Form 6A - Commencement of Contract Work',              'Contract Labour (R&A) Act, 1970',            'CONTRACTOR_AUDIT', 'ALL', NULL, NULL, 'YEARLY',       'Form 6A to be submitted on commencement of new contract work', true),

  -- Section III: Minimum Wages
  ('MINWAGES_ANNUAL_RETURNS', 'Payment of Minimum Wages - Annual Returns',            'Minimum Wages Act, 1948',                    'CONTRACTOR_AUDIT', 'ALL', NULL, NULL, 'YEARLY',       'Annual returns under Minimum Wages Act', true),

  -- Section IV: Weekly Off
  ('CLRA_WEEKLY_OFF',         'Weekly Off Compliance',                                'Contract Labour (R&A) Act, 1970',            'CONTRACTOR_AUDIT', 'ALL', NULL, NULL, 'MONTHLY',      'Verification that contract workers are given weekly off as required', true),

  -- Section V: Provident Fund
  ('EPF_CODE_ALLOTMENT',      'PF Allotment Code Number',                             'Employees'' Provident Fund & MP Act, 1952',  'CONTRACTOR_AUDIT', 'ALL', 20,   NULL, 'YEARLY',       'PF code allotment letter from EPFO', true),
  ('EPF_MONTHLY_CHALLAN',     'PF Monthly Challans',                                  'Employees'' Provident Fund & MP Act, 1952',  'CONTRACTOR_AUDIT', 'ALL', 20,   NULL, 'MONTHLY',      'Monthly PF challan payment proof', true),
  ('EPF_IND_NUMBERS',         'PF Individual Numbers (Location-wise)',                'Employees'' Provident Fund & MP Act, 1952',  'CONTRACTOR_AUDIT', 'ALL', 20,   NULL, 'MONTHLY',      'PF UAN/member numbers assigned to each employee, location-wise', true),
  ('EPF_ECR_PAYMENT',         'PF ECR, Payment Receipt & Acknowledgement (Monthly)',  'Employees'' Provident Fund & MP Act, 1952',  'CONTRACTOR_AUDIT', 'ALL', 20,   NULL, 'MONTHLY',      'Monthly ECR filing, payment receipt and acknowledgement copy', true),
  ('EPF_NOMINATION_FORMS',    'PF Nomination & Declaration Forms',                    'Employees'' Provident Fund & MP Act, 1952',  'CONTRACTOR_AUDIT', 'ALL', 20,   NULL, 'YEARLY',       'Form 2 (Nomination and Declaration) for each PF member', true),

  -- Section VI: ESI
  ('ESIC_CODE_ALLOTMENT',     'ESI Code / Sub-Code Allotment Letter',                 'Employees'' State Insurance Act, 1948',      'CONTRACTOR_AUDIT', 'ALL', 10,   NULL, 'YEARLY',       'ESI employer code/sub-code allotment letter', true),
  ('ESIC_EMP_CARDS',          'ESI Number & Cards for Employees',                     'Employees'' State Insurance Act, 1948',      'CONTRACTOR_AUDIT', 'ALL', 10,   NULL, 'MONTHLY',      'ESI IP numbers and smart cards issued to each eligible employee', true),
  ('ESIC_MONTHLY_CHALLAN',    'ESIC Challans (Monthly)',                              'Employees'' State Insurance Act, 1948',      'CONTRACTOR_AUDIT', 'ALL', 10,   NULL, 'MONTHLY',      'Monthly ESIC contribution challan payment proof', true),
  ('ESIC_FORM7',              'Form 7 - Register of Employees (ESI)',                 'Employees'' State Insurance Act, 1948',      'CONTRACTOR_AUDIT', 'ALL', 10,   NULL, 'MONTHLY',      'Register of employees maintained under ESIC rules (Form 7)', true),
  ('ESIC_REG_ACCIDENTS',      'Register of Accidents',                                'Employees'' State Insurance Act, 1948',      'CONTRACTOR_AUDIT', 'ALL', 10,   NULL, 'MONTHLY',      'Accident register maintained at worksite', true),
  ('ESIC_EMP_PERM_CARDS',     'ESI Permanent / Temporary Cards (Signed)',             'Employees'' State Insurance Act, 1948',      'CONTRACTOR_AUDIT', 'ALL', 10,   NULL, 'MONTHLY',      'ESI permanent or temporary cards duly signed by employee and employer', true),

  -- Section VII: Payment of Bonus Act
  ('BONUS_FORM_C',            'Bonus Act - Register of Form C',                       'Payment of Bonus Act, 1965',                 'CONTRACTOR_AUDIT', 'ALL', 20,   NULL, 'YEARLY',       'Form C register under Payment of Bonus Act', true),
  ('BONUS_FORM_D',            'Bonus Act - Form D Annual Returns',                    'Payment of Bonus Act, 1965',                 'CONTRACTOR_AUDIT', 'ALL', 20,   NULL, 'YEARLY',       'Annual returns in Form D under Payment of Bonus Act', true)

ON CONFLICT (code) DO NOTHING;
