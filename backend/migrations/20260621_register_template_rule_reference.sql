-- Adds rule_reference to register_templates and backfills well-known
-- form codes / rule references so generated registers can show a proper
-- statutory title block (Title, Act, Rule, Form No.).

ALTER TABLE register_templates
  ADD COLUMN IF NOT EXISTS rule_reference varchar(80);

-- ── Code on Wages, 2019 / Central Rules, 2021 ──
UPDATE register_templates SET form_code = COALESCE(form_code, 'Form IV'),
       rule_reference = COALESCE(rule_reference, 'Rule 50(2)(b) of Code on Wages (Central) Rules, 2021')
 WHERE register_type = 'WAGE_REGISTER' AND law_family = 'CODE_ON_WAGES';

UPDATE register_templates SET form_code = COALESCE(form_code, 'Form V'),
       rule_reference = COALESCE(rule_reference, 'Rule 50(2)(a) of Code on Wages (Central) Rules, 2021')
 WHERE register_type = 'MUSTER_ROLL' AND law_family = 'CODE_ON_WAGES';

UPDATE register_templates SET form_code = COALESCE(form_code, 'Form II'),
       rule_reference = COALESCE(rule_reference, 'Rule 50(2)(c) of Code on Wages (Central) Rules, 2021')
 WHERE register_type = 'OVERTIME_REGISTER' AND law_family = 'CODE_ON_WAGES';

UPDATE register_templates SET form_code = COALESCE(form_code, 'Form X'),
       rule_reference = COALESCE(rule_reference, 'Rule 50(3) of Code on Wages (Central) Rules, 2021')
 WHERE register_type = 'WAGE_SLIP_REGISTER' AND law_family = 'CODE_ON_WAGES';

UPDATE register_templates SET form_code = COALESCE(form_code, 'Form I'),
       rule_reference = COALESCE(rule_reference, 'Rule 4 of Code on Wages (Central) Rules, 2021')
 WHERE register_type = 'DEDUCTION_REGISTER' AND law_family = 'CODE_ON_WAGES';

UPDATE register_templates SET form_code = COALESCE(form_code, 'Form III'),
       rule_reference = COALESCE(rule_reference, 'Rule 22 of Code on Wages (Central) Rules, 2021')
 WHERE register_type = 'FINE_REGISTER' AND law_family = 'CODE_ON_WAGES';

UPDATE register_templates SET form_code = COALESCE(form_code, 'Form VII'),
       rule_reference = COALESCE(rule_reference, 'Rule 23 of Code on Wages (Central) Rules, 2021')
 WHERE register_type = 'ADVANCE_REGISTER' AND law_family = 'CODE_ON_WAGES';

UPDATE register_templates SET form_code = COALESCE(form_code, 'Form VIII'),
       rule_reference = COALESCE(rule_reference, 'Rule 24 of Code on Wages (Central) Rules, 2021')
 WHERE register_type = 'DAMAGE_LOSS_REGISTER' AND law_family = 'CODE_ON_WAGES';

UPDATE register_templates SET form_code = COALESCE(form_code, 'Form XII'),
       rule_reference = COALESCE(rule_reference, 'Rule 56 of Code on Wages (Central) Rules, 2021')
 WHERE register_type = 'ANNUAL_RETURN_WAGES' AND law_family = 'CODE_ON_WAGES';

UPDATE register_templates SET form_code = COALESCE(form_code, 'Form VI'),
       rule_reference = COALESCE(rule_reference, 'Rule 21 of Minimum Wages (Central) Rules, 1950')
 WHERE register_type = 'MINIMUM_WAGE_ABSTRACT' AND law_family = 'CODE_ON_WAGES';

-- Combined registers under Ease of Compliance (2017)
UPDATE register_templates SET form_code = COALESCE(form_code, 'Form A'),
       rule_reference = COALESCE(rule_reference, 'Ease of Compliance to Maintain Registers under Various Labour Laws Rules, 2017')
 WHERE register_type = 'COMB_EMPLOYEE_REGISTER';

UPDATE register_templates SET form_code = COALESCE(form_code, 'Form B'),
       rule_reference = COALESCE(rule_reference, 'Ease of Compliance to Maintain Registers under Various Labour Laws Rules, 2017')
 WHERE register_type = 'COMB_WAGE_REGISTER';

UPDATE register_templates SET form_code = COALESCE(form_code, 'Form C'),
       rule_reference = COALESCE(rule_reference, 'Ease of Compliance to Maintain Registers under Various Labour Laws Rules, 2017')
 WHERE register_type = 'COMB_MUSTER_ROLL';

UPDATE register_templates SET form_code = COALESCE(form_code, 'Form D'),
       rule_reference = COALESCE(rule_reference, 'Ease of Compliance to Maintain Registers under Various Labour Laws Rules, 2017')
 WHERE register_type = 'COMB_FINE_DED_ADV_OT';

-- ── Social Security: PF / EPF Scheme 1952 ──
UPDATE register_templates SET form_code = COALESCE(form_code, 'ECR Text File'),
       rule_reference = COALESCE(rule_reference, 'Para 38 of Employees'' Provident Funds Scheme, 1952')
 WHERE register_type IN ('ECR', 'PF_CHALLAN_REGISTER');

UPDATE register_templates SET form_code = COALESCE(form_code, 'Form 3A'),
       rule_reference = COALESCE(rule_reference, 'Para 35 & 42 of EPF Scheme, 1952')
 WHERE register_type = 'PF_REGISTER';

-- ── Social Security: ESI (General) Regulations 1950 ──
UPDATE register_templates SET form_code = COALESCE(form_code, 'Form 5 / MC'),
       rule_reference = COALESCE(rule_reference, 'Regulation 26 & 31 of ESI (General) Regulations, 1950')
 WHERE register_type IN ('ESI', 'ESI_CHALLAN_REGISTER');

UPDATE register_templates SET form_code = COALESCE(form_code, 'Form 6'),
       rule_reference = COALESCE(rule_reference, 'Regulation 32 of ESI (General) Regulations, 1950')
 WHERE register_type = 'ESI_REGISTER';

-- ── Payment of Bonus Act, 1965 / Rules 1975 ──
UPDATE register_templates SET form_code = COALESCE(form_code, 'Form C'),
       rule_reference = COALESCE(rule_reference, 'Rule 4(c) of Payment of Bonus Rules, 1975')
 WHERE register_type = 'BONUS_REGISTER';

UPDATE register_templates SET form_code = COALESCE(form_code, 'Form A & B'),
       rule_reference = COALESCE(rule_reference, 'Rule 4(a) & 4(b) of Payment of Bonus Rules, 1975')
 WHERE register_type = 'BONUS_SET_ON_OFF';

UPDATE register_templates SET form_code = COALESCE(form_code, 'Form D'),
       rule_reference = COALESCE(rule_reference, 'Rule 5 of Payment of Bonus Rules, 1975')
 WHERE register_type = 'BONUS_ANNUAL_RETURN';

UPDATE register_templates SET form_code = COALESCE(form_code, 'Annexure'),
       rule_reference = COALESCE(rule_reference, 'Section 4 of Payment of Bonus Act, 1965')
 WHERE register_type = 'BONUS_COMPUTATION_SHEET';

-- ── Payment of Gratuity Act, 1972 / Central Rules 1972 ──
UPDATE register_templates SET form_code = COALESCE(form_code, 'Form L'),
       rule_reference = COALESCE(rule_reference, 'Rule 8 of Payment of Gratuity (Central) Rules, 1972')
 WHERE register_type = 'GRATUITY_REGISTER';

UPDATE register_templates SET form_code = COALESCE(form_code, 'Annexure'),
       rule_reference = COALESCE(rule_reference, 'Section 4 of Payment of Gratuity Act, 1972')
 WHERE register_type IN ('GRAT_COMPUTATION_REGISTER', 'GRAT_PAYMENT_REGISTER');

-- ── Contract Labour (R&A) Act, 1970 / Central Rules 1971 ──
UPDATE register_templates SET form_code = COALESCE(form_code, 'Form XVI'),
       rule_reference = COALESCE(rule_reference, 'Rule 78(1)(a)(i) of CLRA (Central) Rules, 1971')
 WHERE register_type = 'CONTRACT_MUSTER_ROLL';

UPDATE register_templates SET form_code = COALESCE(form_code, 'Form XVII'),
       rule_reference = COALESCE(rule_reference, 'Rule 78(1)(a)(ii) of CLRA (Central) Rules, 1971')
 WHERE register_type = 'CONTRACT_WAGE_REGISTER';

UPDATE register_templates SET form_code = COALESCE(form_code, 'Form XX'),
       rule_reference = COALESCE(rule_reference, 'Rule 78(2)(b) of CLRA (Central) Rules, 1971')
 WHERE register_type = 'CONTRACT_DEDUCTION_REGISTER';

UPDATE register_templates SET form_code = COALESCE(form_code, 'Form XXIII'),
       rule_reference = COALESCE(rule_reference, 'Rule 78(2)(a) of CLRA (Central) Rules, 1971')
 WHERE register_type = 'CONTRACT_OVERTIME_REGISTER';

UPDATE register_templates SET form_code = COALESCE(form_code, 'Form XVIII'),
       rule_reference = COALESCE(rule_reference, 'Rule 78(1)(a)(iii) of CLRA (Central) Rules, 1971')
 WHERE register_type = 'CONTRACT_REGISTER';

UPDATE register_templates SET form_code = COALESCE(form_code, 'Form XIX'),
       rule_reference = COALESCE(rule_reference, 'Rule 78(1)(b) of CLRA (Central) Rules, 1971')
 WHERE register_type = 'CLRA_WAGE_SLIP';

-- ── Factories Act, 1948 / Central Rules ──
UPDATE register_templates SET form_code = COALESCE(form_code, 'Form 12'),
       rule_reference = COALESCE(rule_reference, 'Rule 78 / Section 62 of Factories Act, 1948')
 WHERE register_type = 'ADULT_WORKER_REGISTER' AND law_family = 'FACTORIES_ACT';

UPDATE register_templates SET form_code = COALESCE(form_code, 'Form 15'),
       rule_reference = COALESCE(rule_reference, 'Rule 94 / Section 79 of Factories Act, 1948')
 WHERE register_type = 'LEAVE_BOOK' AND law_family = 'FACTORIES_ACT';

-- ── Maternity Benefit Act, 1961 ──
UPDATE register_templates SET form_code = COALESCE(form_code, 'Form A'),
       rule_reference = COALESCE(rule_reference, 'Rule 3 of Maternity Benefit (Mines & Circus) Rules, 1963')
 WHERE register_type = 'MATERNITY_REGISTER';

-- ── Equal Remuneration Act, 1976 ──
UPDATE register_templates SET form_code = COALESCE(form_code, 'Form D'),
       rule_reference = COALESCE(rule_reference, 'Rule 6 of Equal Remuneration Rules, 1976')
 WHERE register_type = 'EQUAL_REMUNERATION_REGISTER';

-- ── Labour Welfare Fund (varies by state) ──
UPDATE register_templates SET form_code = COALESCE(form_code, 'Form A'),
       rule_reference = COALESCE(rule_reference, 'State Labour Welfare Fund Rules')
 WHERE register_type IN ('LWF_REGISTER', 'LWF_CONTRIBUTION_REGISTER');

-- ── Professional Tax (varies by state) ──
UPDATE register_templates SET form_code = COALESCE(form_code, 'Form V'),
       rule_reference = COALESCE(rule_reference, 'State Profession Tax Rules')
 WHERE register_type = 'PT_REGISTER';

UPDATE register_templates SET form_code = COALESCE(form_code, 'Form V-A'),
       rule_reference = COALESCE(rule_reference, 'State Profession Tax Rules')
 WHERE register_type = 'PT_RETURN_REGISTER';

-- ── Shops & Establishments (varies by state) ──
UPDATE register_templates SET form_code = COALESCE(form_code, 'Form A'),
       rule_reference = COALESCE(rule_reference, 'State Shops & Establishments Rules')
 WHERE register_type IN ('SHOPS_WAGE_REGISTER', 'SHOPS_LEAVE_REGISTER', 'SHOPS_WORK_HOURS_REGISTER', 'EMPLOYEE_REGISTER');
