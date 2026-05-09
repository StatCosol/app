-- ============================================================
-- State-specific register templates
-- These OVERRIDE the 'ALL' defaults when a branch's stateCode matches
-- Unique constraint: (state_code, establishment_type, register_type)
-- ============================================================

-- =========================================================
-- TELANGANA (TS) - Telangana Factories Rules / TS S&E Act
-- =========================================================

-- TS FACTORY: Wage Register (Form XII - TS Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('TS', 'FACTORY', 'WAGE_REGISTER',
  'Wage Register (Form XII - Telangana Factories Rules)',
  'Monthly wage register as prescribed under Telangana Factories Rules / Payment of Wages Act',
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
    {"key":"att_bonus","header":"Attendance Bonus (Rs.)","source":"COMP:ATT_BONUS","width":14},
    {"key":"other_earnings","header":"Other Earnings (Rs.)","source":"COMP:OTHER_EARNINGS","width":13},
    {"key":"gross_earnings","header":"Total Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pf_emp","header":"PF Deduction (Rs.)","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI Deduction (Rs.)","source":"STAT:ESI_EMP","width":12},
    {"key":"pt","header":"Prof. Tax (Rs.)","source":"STAT:PT","width":10},
    {"key":"total_deductions","header":"Total Deductions (Rs.)","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Wages Payable (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"signature","header":"Signature / Thumb Impression","source":"","width":18}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- TS FACTORY: Muster Roll (Form 25 - TS Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('TS', 'FACTORY', 'MUSTER_ROLL',
  'Muster Roll (Form 25 - Telangana Factories Rules)',
  'Monthly attendance / muster roll as prescribed under Telangana Factories Rules',
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

-- TS FACTORY: Overtime Register (Form IX - TS Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('TS', 'FACTORY', 'OVERTIME_REGISTER',
  'Overtime Register (Form IX - Telangana Factories Rules)',
  'Register of overtime work as prescribed under Telangana Factories Rules',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"days_present","header":"No. of Days Worked","source":"FIELD:days_present","width":10},
    {"key":"ot_hours","header":"Total OT Hours Worked","source":"FIELD:ot_hours","width":14},
    {"key":"basic","header":"Normal Rate of Wages (Rs.)","source":"COMP:BASIC","width":14},
    {"key":"gross_earnings","header":"Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"net_pay","header":"Net Wages Paid (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- TS FACTORY: Leave with Wages Register (Form 15 - TS Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('TS', 'FACTORY', 'LEAVE_REGISTER',
  'Leave with Wages Register (Form 15 - Telangana Factories Rules)',
  'Register of leave with wages as prescribed under Telangana Factories Rules',
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
    {"key":"el_balance","header":"Earned Leave Balance","source":"COMP:EL_BALANCE","width":12},
    {"key":"basic","header":"Basic Wages (Rs.)","source":"COMP:BASIC","width":12},
    {"key":"net_pay","header":"Net Pay (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- TS ESTABLISHMENT: Wage Register (Form V - TS S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('TS', 'ESTABLISHMENT', 'WAGE_REGISTER',
  'Wage Register (Form V - Telangana Shops & Establishments Act)',
  'Monthly wage register as prescribed under Telangana Shops & Establishments Act, 1988',
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
    {"key":"att_bonus","header":"Attendance Bonus (Rs.)","source":"COMP:ATT_BONUS","width":14},
    {"key":"other_earnings","header":"Other Earnings (Rs.)","source":"COMP:OTHER_EARNINGS","width":13},
    {"key":"gross_earnings","header":"Gross Salary (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pf_emp","header":"PF (Employee) (Rs.)","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI (Employee) (Rs.)","source":"STAT:ESI_EMP","width":12},
    {"key":"pt","header":"Prof. Tax (Rs.)","source":"STAT:PT","width":10},
    {"key":"total_deductions","header":"Total Deductions (Rs.)","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Salary (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"signature","header":"Signature","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- TS ESTABLISHMENT: Attendance Register (Form IV - TS S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('TS', 'ESTABLISHMENT', 'MUSTER_ROLL',
  'Attendance Register (Form IV - Telangana Shops & Establishments Act)',
  'Monthly attendance register as prescribed under Telangana Shops & Establishments Act, 1988',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days in Month","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Present","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Days Absent","source":"FIELD:lop_days","width":10},
    {"key":"ncp_days","header":"NCP Days","source":"FIELD:ncp_days","width":10},
    {"key":"ot_hours","header":"OT Hours","source":"FIELD:ot_hours","width":10},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- TS ESTABLISHMENT: Leave Register (Form VI - TS S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('TS', 'ESTABLISHMENT', 'LEAVE_REGISTER',
  'Leave Register (Form VI - Telangana Shops & Establishments Act)',
  'Register of leave as prescribed under Telangana Shops & Establishments Act, 1988',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Present","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Leave Without Pay","source":"FIELD:lop_days","width":12},
    {"key":"el_balance","header":"Earned Leave Balance","source":"COMP:EL_BALANCE","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- TS COMMON: Professional Tax Register (Telangana PT slabs)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('TS', 'COMMON', 'PT_REGISTER',
  'Professional Tax Register (Telangana)',
  'Register of Professional Tax deductions as per Telangana PT Act. Slabs: ≤15000=₹0, 15001-20000=₹150, >20000=₹200/month',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"gross_earnings","header":"Gross Salary (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pt","header":"PT Deducted (Rs.)","source":"STAT:PT","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":12}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;


-- =========================================================
-- ANDHRA PRADESH (AP) - AP Factories Rules / AP S&E Act
-- =========================================================

-- AP FACTORY: Wage Register (Form XII - AP Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('AP', 'FACTORY', 'WAGE_REGISTER',
  'Wage Register (Form XII - Andhra Pradesh Factories Rules)',
  'Monthly wage register as prescribed under AP Factories Rules / Payment of Wages Act',
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
    {"key":"att_bonus","header":"Attendance Bonus (Rs.)","source":"COMP:ATT_BONUS","width":14},
    {"key":"other_earnings","header":"Other Earnings (Rs.)","source":"COMP:OTHER_EARNINGS","width":13},
    {"key":"gross_earnings","header":"Total Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pf_emp","header":"PF Deduction (Rs.)","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI Deduction (Rs.)","source":"STAT:ESI_EMP","width":12},
    {"key":"pt","header":"Prof. Tax (Rs.)","source":"STAT:PT","width":10},
    {"key":"total_deductions","header":"Total Deductions (Rs.)","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Wages Payable (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"signature","header":"Signature / Thumb Impression","source":"","width":18}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- AP FACTORY: Muster Roll (Form 25 - AP Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('AP', 'FACTORY', 'MUSTER_ROLL',
  'Muster Roll (Form 25 - Andhra Pradesh Factories Rules)',
  'Monthly attendance / muster roll as prescribed under AP Factories Rules',
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

-- AP FACTORY: Overtime Register (Form IX - AP Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('AP', 'FACTORY', 'OVERTIME_REGISTER',
  'Overtime Register (Form IX - Andhra Pradesh Factories Rules)',
  'Register of overtime work as prescribed under AP Factories Rules',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"days_present","header":"No. of Days Worked","source":"FIELD:days_present","width":10},
    {"key":"ot_hours","header":"Total OT Hours Worked","source":"FIELD:ot_hours","width":14},
    {"key":"basic","header":"Normal Rate of Wages (Rs.)","source":"COMP:BASIC","width":14},
    {"key":"gross_earnings","header":"Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"net_pay","header":"Net Wages Paid (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- AP FACTORY: Leave with Wages Register (Form 15 - AP Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('AP', 'FACTORY', 'LEAVE_REGISTER',
  'Leave with Wages Register (Form 15 - Andhra Pradesh Factories Rules)',
  'Register of leave with wages as prescribed under AP Factories Rules',
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
    {"key":"el_balance","header":"Earned Leave Balance","source":"COMP:EL_BALANCE","width":12},
    {"key":"basic","header":"Basic Wages (Rs.)","source":"COMP:BASIC","width":12},
    {"key":"net_pay","header":"Net Pay (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- AP ESTABLISHMENT: Wage Register (Form III - AP S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('AP', 'ESTABLISHMENT', 'WAGE_REGISTER',
  'Wage Register (Form III - AP Shops & Establishments Act)',
  'Monthly wage register as prescribed under AP Shops & Establishments Act, 1988',
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
    {"key":"att_bonus","header":"Attendance Bonus (Rs.)","source":"COMP:ATT_BONUS","width":14},
    {"key":"other_earnings","header":"Other Earnings (Rs.)","source":"COMP:OTHER_EARNINGS","width":13},
    {"key":"gross_earnings","header":"Gross Salary (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pf_emp","header":"PF (Employee) (Rs.)","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI (Employee) (Rs.)","source":"STAT:ESI_EMP","width":12},
    {"key":"pt","header":"Prof. Tax (Rs.)","source":"STAT:PT","width":10},
    {"key":"total_deductions","header":"Total Deductions (Rs.)","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Salary (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"signature","header":"Signature","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- AP ESTABLISHMENT: Attendance Register (Form II - AP S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('AP', 'ESTABLISHMENT', 'MUSTER_ROLL',
  'Attendance Register (Form II - AP Shops & Establishments Act)',
  'Monthly attendance register as prescribed under AP Shops & Establishments Act, 1988',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days in Month","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Present","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Days Absent","source":"FIELD:lop_days","width":10},
    {"key":"ncp_days","header":"NCP Days","source":"FIELD:ncp_days","width":10},
    {"key":"ot_hours","header":"OT Hours","source":"FIELD:ot_hours","width":10},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- AP ESTABLISHMENT: Leave Register (Form IV - AP S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('AP', 'ESTABLISHMENT', 'LEAVE_REGISTER',
  'Leave Register (Form IV - AP Shops & Establishments Act)',
  'Register of leave as prescribed under AP Shops & Establishments Act, 1988',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s / Husband''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Present","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Leave Without Pay","source":"FIELD:lop_days","width":12},
    {"key":"el_balance","header":"Earned Leave Balance","source":"COMP:EL_BALANCE","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- AP COMMON: Professional Tax Register (AP PT slabs)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('AP', 'COMMON', 'PT_REGISTER',
  'Professional Tax Register (Andhra Pradesh)',
  'Register of Professional Tax deductions as per AP PT Act. Slabs: ≤15000=₹0, 15001-20000=₹150, >20000=₹200/month',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"gross_earnings","header":"Gross Salary (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pt","header":"PT Deducted (Rs.)","source":"STAT:PT","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":12}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;


-- =========================================================
-- KARNATAKA (KA) - Karnataka Factories Rules / KA S&E Act
-- =========================================================

-- KA FACTORY: Wage Register (Form XVII - Karnataka Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('KA', 'FACTORY', 'WAGE_REGISTER',
  'Wage Register (Form XVII - Karnataka Factories Rules)',
  'Monthly wage register as prescribed under Karnataka Factories Rules, 1969',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation / Department","source":"FIELD:designation","width":16},
    {"key":"days_present","header":"No. of Days Worked","source":"FIELD:days_present","width":10},
    {"key":"basic","header":"Basic Wages (Rs.)","source":"COMP:BASIC","width":12},
    {"key":"hra","header":"HRA (Rs.)","source":"COMP:HRA","width":10},
    {"key":"other_allowances","header":"Other Allowances (Rs.)","source":"COMP:OTHERS","width":14},
    {"key":"att_bonus","header":"Attendance Bonus (Rs.)","source":"COMP:ATT_BONUS","width":14},
    {"key":"other_earnings","header":"Other Earnings (Rs.)","source":"COMP:OTHER_EARNINGS","width":13},
    {"key":"gross_earnings","header":"Total Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pf_emp","header":"PF (Employee) (Rs.)","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI (Employee) (Rs.)","source":"STAT:ESI_EMP","width":12},
    {"key":"pt","header":"Prof. Tax (Rs.)","source":"STAT:PT","width":10},
    {"key":"total_deductions","header":"Total Deductions (Rs.)","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Wages Payable (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"signature","header":"Signature / Thumb Impression","source":"","width":18}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- KA FACTORY: Muster Roll (Form 25 - Karnataka Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('KA', 'FACTORY', 'MUSTER_ROLL',
  'Muster Roll (Form 25 - Karnataka Factories Rules)',
  'Monthly attendance / muster roll as prescribed under Karnataka Factories Rules',
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

-- KA FACTORY: Overtime Register (Form IX - Karnataka Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('KA', 'FACTORY', 'OVERTIME_REGISTER',
  'Overtime Register (Form IX - Karnataka Factories Rules)',
  'Register of overtime work as prescribed under Karnataka Factories Rules',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"days_present","header":"No. of Days Worked","source":"FIELD:days_present","width":10},
    {"key":"ot_hours","header":"Total OT Hours Worked","source":"FIELD:ot_hours","width":14},
    {"key":"basic","header":"Normal Rate of Wages (Rs.)","source":"COMP:BASIC","width":14},
    {"key":"gross_earnings","header":"Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"net_pay","header":"Net Wages Paid (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- KA FACTORY: Leave with Wages Register (Form 15 - Karnataka Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('KA', 'FACTORY', 'LEAVE_REGISTER',
  'Leave with Wages Register (Form 15 - Karnataka Factories Rules)',
  'Register of leave with wages as prescribed under Karnataka Factories Rules',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days in Month","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Worked","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Leave Without Pay","source":"FIELD:lop_days","width":12},
    {"key":"ncp_days","header":"NCP Days","source":"FIELD:ncp_days","width":10},
    {"key":"el_balance","header":"Earned Leave Balance","source":"COMP:EL_BALANCE","width":12},
    {"key":"basic","header":"Basic Wages (Rs.)","source":"COMP:BASIC","width":12},
    {"key":"net_pay","header":"Net Pay (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- KA ESTABLISHMENT: Wage Register (Form R - Karnataka S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('KA', 'ESTABLISHMENT', 'WAGE_REGISTER',
  'Wage Register (Form R - Karnataka Shops & Establishments Act)',
  'Monthly wage register as prescribed under Karnataka Shops & Establishments Act, 1961',
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
    {"key":"att_bonus","header":"Attendance Bonus (Rs.)","source":"COMP:ATT_BONUS","width":14},
    {"key":"other_earnings","header":"Other Earnings (Rs.)","source":"COMP:OTHER_EARNINGS","width":13},
    {"key":"gross_earnings","header":"Gross Salary (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pf_emp","header":"PF (Employee) (Rs.)","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI (Employee) (Rs.)","source":"STAT:ESI_EMP","width":12},
    {"key":"pt","header":"Prof. Tax (Rs.)","source":"STAT:PT","width":10},
    {"key":"total_deductions","header":"Total Deductions (Rs.)","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Salary (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"signature","header":"Signature","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- KA ESTABLISHMENT: Attendance Register (Form Q - Karnataka S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('KA', 'ESTABLISHMENT', 'MUSTER_ROLL',
  'Attendance Register (Form Q - Karnataka Shops & Establishments Act)',
  'Monthly attendance register as prescribed under Karnataka Shops & Establishments Act, 1961',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days in Month","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Present","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Days Absent","source":"FIELD:lop_days","width":10},
    {"key":"ncp_days","header":"NCP Days","source":"FIELD:ncp_days","width":10},
    {"key":"ot_hours","header":"OT Hours","source":"FIELD:ot_hours","width":10},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- KA ESTABLISHMENT: Leave Register (Form S - Karnataka S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('KA', 'ESTABLISHMENT', 'LEAVE_REGISTER',
  'Leave Register (Form S - Karnataka Shops & Establishments Act)',
  'Register of leave as prescribed under Karnataka Shops & Establishments Act, 1961',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Present","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Leave Without Pay","source":"FIELD:lop_days","width":12},
    {"key":"el_balance","header":"Earned Leave Balance","source":"COMP:EL_BALANCE","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- KA COMMON: Professional Tax Register (Karnataka PT slabs)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('KA', 'COMMON', 'PT_REGISTER',
  'Professional Tax Register (Karnataka)',
  'Register of Professional Tax deductions as per Karnataka PT Act. Slabs: ≤15000=₹0, 15001-25000=₹200, >25000=₹200/month (Feb=₹300)',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"gross_earnings","header":"Gross Salary (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pt","header":"PT Deducted (Rs.)","source":"STAT:PT","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":12}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;


-- =========================================================
-- TAMIL NADU (TN) - TN Factories Rules / TN S&E Act
-- =========================================================

-- TN FACTORY: Wage Register (Form XVII - TN Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('TN', 'FACTORY', 'WAGE_REGISTER',
  'Wage Register (Form XVII - Tamil Nadu Factories Rules)',
  'Monthly wage register as prescribed under Tamil Nadu Factories Rules, 1950',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation / Dept.","source":"FIELD:designation","width":15},
    {"key":"days_present","header":"No. of Days Worked","source":"FIELD:days_present","width":10},
    {"key":"basic","header":"Basic Wages (Rs.)","source":"COMP:BASIC","width":12},
    {"key":"hra","header":"HRA (Rs.)","source":"COMP:HRA","width":10},
    {"key":"other_allowances","header":"Other Allowances (Rs.)","source":"COMP:OTHERS","width":14},
    {"key":"att_bonus","header":"Attendance Bonus (Rs.)","source":"COMP:ATT_BONUS","width":14},
    {"key":"other_earnings","header":"Other Earnings (Rs.)","source":"COMP:OTHER_EARNINGS","width":13},
    {"key":"gross_earnings","header":"Total Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pf_emp","header":"PF Deduction (Rs.)","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI Deduction (Rs.)","source":"STAT:ESI_EMP","width":12},
    {"key":"pt","header":"Prof. Tax (Rs.)","source":"STAT:PT","width":10},
    {"key":"total_deductions","header":"Total Deductions (Rs.)","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Wages Payable (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"signature","header":"Signature / Thumb Impression","source":"","width":18}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- TN FACTORY: Muster Roll (Form 25 - TN Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('TN', 'FACTORY', 'MUSTER_ROLL',
  'Muster Roll (Form 25 - Tamil Nadu Factories Rules)',
  'Monthly attendance / muster roll as prescribed under TN Factories Rules',
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

-- TN FACTORY: Overtime Register (Form IX - TN Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('TN', 'FACTORY', 'OVERTIME_REGISTER',
  'Overtime Register (Form IX - Tamil Nadu Factories Rules)',
  'Register of overtime work as prescribed under TN Factories Rules',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"days_present","header":"No. of Days Worked","source":"FIELD:days_present","width":10},
    {"key":"ot_hours","header":"Total OT Hours Worked","source":"FIELD:ot_hours","width":14},
    {"key":"basic","header":"Normal Rate of Wages (Rs.)","source":"COMP:BASIC","width":14},
    {"key":"gross_earnings","header":"Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"net_pay","header":"Net Wages Paid (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- TN FACTORY: Leave with Wages Register (Form 15 - TN Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('TN', 'FACTORY', 'LEAVE_REGISTER',
  'Leave with Wages Register (Form 15 - Tamil Nadu Factories Rules)',
  'Register of leave with wages as prescribed under TN Factories Rules',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days in Month","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Worked","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Leave Without Pay","source":"FIELD:lop_days","width":12},
    {"key":"ncp_days","header":"NCP Days","source":"FIELD:ncp_days","width":10},
    {"key":"el_balance","header":"Earned Leave Balance","source":"COMP:EL_BALANCE","width":12},
    {"key":"basic","header":"Basic Wages (Rs.)","source":"COMP:BASIC","width":12},
    {"key":"net_pay","header":"Net Pay (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- TN ESTABLISHMENT: Wage Register (Form P - TN S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('TN', 'ESTABLISHMENT', 'WAGE_REGISTER',
  'Wage Register (Form P - Tamil Nadu Shops & Establishments Act)',
  'Monthly wage register as prescribed under TN Shops & Establishments Act, 1947',
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
    {"key":"att_bonus","header":"Attendance Bonus (Rs.)","source":"COMP:ATT_BONUS","width":14},
    {"key":"other_earnings","header":"Other Earnings (Rs.)","source":"COMP:OTHER_EARNINGS","width":13},
    {"key":"gross_earnings","header":"Gross Salary (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pf_emp","header":"PF (Employee) (Rs.)","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI (Employee) (Rs.)","source":"STAT:ESI_EMP","width":12},
    {"key":"pt","header":"Prof. Tax (Rs.)","source":"STAT:PT","width":10},
    {"key":"total_deductions","header":"Total Deductions (Rs.)","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Salary (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"signature","header":"Signature","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- TN ESTABLISHMENT: Attendance Register (Form O - TN S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('TN', 'ESTABLISHMENT', 'MUSTER_ROLL',
  'Attendance Register (Form O - Tamil Nadu Shops & Establishments Act)',
  'Monthly attendance register as prescribed under TN Shops & Establishments Act, 1947',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days in Month","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Present","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Days Absent","source":"FIELD:lop_days","width":10},
    {"key":"ncp_days","header":"NCP Days","source":"FIELD:ncp_days","width":10},
    {"key":"ot_hours","header":"OT Hours","source":"FIELD:ot_hours","width":10},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- TN ESTABLISHMENT: Leave Register (Form N - TN S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('TN', 'ESTABLISHMENT', 'LEAVE_REGISTER',
  'Leave Register (Form N - Tamil Nadu Shops & Establishments Act)',
  'Register of leave as prescribed under TN Shops & Establishments Act, 1947',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Present","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Leave Without Pay","source":"FIELD:lop_days","width":12},
    {"key":"el_balance","header":"Earned Leave Balance","source":"COMP:EL_BALANCE","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- TN COMMON: Professional Tax Register (Tamil Nadu - No PT)
-- Note: Tamil Nadu does NOT levy Professional Tax
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('TN', 'COMMON', 'PT_REGISTER',
  'Professional Tax Register (Tamil Nadu - Not Applicable)',
  'Tamil Nadu does not levy Professional Tax. This register is kept for record with NIL entries.',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"gross_earnings","header":"Gross Salary (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pt","header":"PT Deducted (Rs.)","source":"STAT:PT","width":12},
    {"key":"remarks","header":"Remarks (PT Not Applicable in TN)","source":"","width":20}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;


-- =========================================================
-- MAHARASHTRA (MH) - MH Factories Rules / MH S&E Act
-- =========================================================

-- MH FACTORY: Wage Register (Form D - Maharashtra Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('MH', 'FACTORY', 'WAGE_REGISTER',
  'Wage Register (Form D - Maharashtra Factories Rules)',
  'Monthly wage register as prescribed under Maharashtra Factories Rules, 1963',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation / Dept.","source":"FIELD:designation","width":15},
    {"key":"days_present","header":"No. of Days Worked","source":"FIELD:days_present","width":10},
    {"key":"basic","header":"Basic Wages (Rs.)","source":"COMP:BASIC","width":12},
    {"key":"hra","header":"HRA (Rs.)","source":"COMP:HRA","width":10},
    {"key":"other_allowances","header":"Other Allowances (Rs.)","source":"COMP:OTHERS","width":14},
    {"key":"att_bonus","header":"Attendance Bonus (Rs.)","source":"COMP:ATT_BONUS","width":14},
    {"key":"other_earnings","header":"Other Earnings (Rs.)","source":"COMP:OTHER_EARNINGS","width":13},
    {"key":"gross_earnings","header":"Total Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pf_emp","header":"PF Deduction (Rs.)","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI Deduction (Rs.)","source":"STAT:ESI_EMP","width":12},
    {"key":"pt","header":"Prof. Tax (Rs.)","source":"STAT:PT","width":10},
    {"key":"total_deductions","header":"Total Deductions (Rs.)","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Wages Payable (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"signature","header":"Signature / Thumb Impression","source":"","width":18}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- MH FACTORY: Muster Roll (Form 25 - Maharashtra Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('MH', 'FACTORY', 'MUSTER_ROLL',
  'Muster Roll (Form 25 - Maharashtra Factories Rules)',
  'Monthly attendance / muster roll as prescribed under Maharashtra Factories Rules',
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

-- MH FACTORY: Overtime Register (Form IX - Maharashtra Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('MH', 'FACTORY', 'OVERTIME_REGISTER',
  'Overtime Register (Form IX - Maharashtra Factories Rules)',
  'Register of overtime work as prescribed under Maharashtra Factories Rules',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"days_present","header":"No. of Days Worked","source":"FIELD:days_present","width":10},
    {"key":"ot_hours","header":"Total OT Hours Worked","source":"FIELD:ot_hours","width":14},
    {"key":"basic","header":"Normal Rate of Wages (Rs.)","source":"COMP:BASIC","width":14},
    {"key":"gross_earnings","header":"Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"net_pay","header":"Net Wages Paid (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- MH FACTORY: Leave with Wages Register (Form 15 - Maharashtra Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('MH', 'FACTORY', 'LEAVE_REGISTER',
  'Leave with Wages Register (Form 15 - Maharashtra Factories Rules)',
  'Register of leave with wages as prescribed under Maharashtra Factories Rules',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days in Month","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Worked","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Leave Without Pay","source":"FIELD:lop_days","width":12},
    {"key":"ncp_days","header":"NCP Days","source":"FIELD:ncp_days","width":10},
    {"key":"el_balance","header":"Earned Leave Balance","source":"COMP:EL_BALANCE","width":12},
    {"key":"basic","header":"Basic Wages (Rs.)","source":"COMP:BASIC","width":12},
    {"key":"net_pay","header":"Net Pay (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- MH ESTABLISHMENT: Wage Register (Form X - Maharashtra S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('MH', 'ESTABLISHMENT', 'WAGE_REGISTER',
  'Wage Register (Form X - Maharashtra Shops & Establishments Act)',
  'Monthly wage register as prescribed under Maharashtra Shops & Establishments Act, 2017',
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
    {"key":"att_bonus","header":"Attendance Bonus (Rs.)","source":"COMP:ATT_BONUS","width":14},
    {"key":"other_earnings","header":"Other Earnings (Rs.)","source":"COMP:OTHER_EARNINGS","width":13},
    {"key":"gross_earnings","header":"Gross Salary (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pf_emp","header":"PF (Employee) (Rs.)","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI (Employee) (Rs.)","source":"STAT:ESI_EMP","width":12},
    {"key":"pt","header":"Prof. Tax (Rs.)","source":"STAT:PT","width":10},
    {"key":"total_deductions","header":"Total Deductions (Rs.)","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Salary (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"signature","header":"Signature","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- MH ESTABLISHMENT: Attendance Register (Form VIII - Maharashtra S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('MH', 'ESTABLISHMENT', 'MUSTER_ROLL',
  'Attendance Register (Form VIII - Maharashtra Shops & Establishments Act)',
  'Monthly attendance register as prescribed under Maharashtra Shops & Establishments Act, 2017',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days in Month","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Present","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Days Absent","source":"FIELD:lop_days","width":10},
    {"key":"ncp_days","header":"NCP Days","source":"FIELD:ncp_days","width":10},
    {"key":"ot_hours","header":"OT Hours","source":"FIELD:ot_hours","width":10},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- MH ESTABLISHMENT: Leave Register (Form IX - Maharashtra S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('MH', 'ESTABLISHMENT', 'LEAVE_REGISTER',
  'Leave Register (Form IX - Maharashtra Shops & Establishments Act)',
  'Register of leave as prescribed under Maharashtra Shops & Establishments Act, 2017',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Present","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Leave Without Pay","source":"FIELD:lop_days","width":12},
    {"key":"el_balance","header":"Earned Leave Balance","source":"COMP:EL_BALANCE","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- MH COMMON: Professional Tax Register (Maharashtra PT slabs)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('MH', 'COMMON', 'PT_REGISTER',
  'Professional Tax Register (Maharashtra)',
  'Register of Professional Tax deductions as per Maharashtra PT Act. Slabs: ≤7500=₹0, 7501-10000=₹175, Male>10000=₹200/month (Feb=₹300), Female>10000=₹0 (per old slab; check latest)',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"gross_earnings","header":"Gross Salary (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pt","header":"PT Deducted (Rs.)","source":"STAT:PT","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":12}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;


-- =========================================================
-- GUJARAT (GJ) - Gujarat Factories Rules / Gujarat S&E Act
-- =========================================================

-- GJ FACTORY: Wage Register (Form D - Gujarat Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('GJ', 'FACTORY', 'WAGE_REGISTER',
  'Wage Register (Form D - Gujarat Factories Rules)',
  'Monthly wage register as prescribed under Gujarat Factories Rules, 1963',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation / Dept.","source":"FIELD:designation","width":15},
    {"key":"days_present","header":"No. of Days Worked","source":"FIELD:days_present","width":10},
    {"key":"basic","header":"Basic Wages (Rs.)","source":"COMP:BASIC","width":12},
    {"key":"hra","header":"HRA (Rs.)","source":"COMP:HRA","width":10},
    {"key":"other_allowances","header":"Other Allowances (Rs.)","source":"COMP:OTHERS","width":14},
    {"key":"att_bonus","header":"Attendance Bonus (Rs.)","source":"COMP:ATT_BONUS","width":14},
    {"key":"other_earnings","header":"Other Earnings (Rs.)","source":"COMP:OTHER_EARNINGS","width":13},
    {"key":"gross_earnings","header":"Total Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pf_emp","header":"PF Deduction (Rs.)","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI Deduction (Rs.)","source":"STAT:ESI_EMP","width":12},
    {"key":"pt","header":"Prof. Tax (Rs.)","source":"STAT:PT","width":10},
    {"key":"total_deductions","header":"Total Deductions (Rs.)","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Wages Payable (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"signature","header":"Signature / Thumb Impression","source":"","width":18}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- GJ FACTORY: Muster Roll (Form 25 - Gujarat Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('GJ', 'FACTORY', 'MUSTER_ROLL',
  'Muster Roll (Form 25 - Gujarat Factories Rules)',
  'Monthly attendance / muster roll as prescribed under Gujarat Factories Rules',
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

-- GJ FACTORY: Overtime Register (Form IX - Gujarat Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('GJ', 'FACTORY', 'OVERTIME_REGISTER',
  'Overtime Register (Form IX - Gujarat Factories Rules)',
  'Register of overtime work as prescribed under Gujarat Factories Rules',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"days_present","header":"No. of Days Worked","source":"FIELD:days_present","width":10},
    {"key":"ot_hours","header":"Total OT Hours Worked","source":"FIELD:ot_hours","width":14},
    {"key":"basic","header":"Normal Rate of Wages (Rs.)","source":"COMP:BASIC","width":14},
    {"key":"gross_earnings","header":"Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"net_pay","header":"Net Wages Paid (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- GJ FACTORY: Leave with Wages Register (Form 15 - Gujarat Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('GJ', 'FACTORY', 'LEAVE_REGISTER',
  'Leave with Wages Register (Form 15 - Gujarat Factories Rules)',
  'Register of leave with wages as prescribed under Gujarat Factories Rules',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days in Month","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Worked","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Leave Without Pay","source":"FIELD:lop_days","width":12},
    {"key":"ncp_days","header":"NCP Days","source":"FIELD:ncp_days","width":10},
    {"key":"el_balance","header":"Earned Leave Balance","source":"COMP:EL_BALANCE","width":12},
    {"key":"basic","header":"Basic Wages (Rs.)","source":"COMP:BASIC","width":12},
    {"key":"net_pay","header":"Net Pay (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- GJ ESTABLISHMENT: Wage Register (Form G - Gujarat S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('GJ', 'ESTABLISHMENT', 'WAGE_REGISTER',
  'Wage Register (Form G - Gujarat Shops & Establishments Act)',
  'Monthly wage register as prescribed under Gujarat Shops & Establishments Act, 1948',
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
    {"key":"att_bonus","header":"Attendance Bonus (Rs.)","source":"COMP:ATT_BONUS","width":14},
    {"key":"other_earnings","header":"Other Earnings (Rs.)","source":"COMP:OTHER_EARNINGS","width":13},
    {"key":"gross_earnings","header":"Gross Salary (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pf_emp","header":"PF (Employee) (Rs.)","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI (Employee) (Rs.)","source":"STAT:ESI_EMP","width":12},
    {"key":"pt","header":"Prof. Tax (Rs.)","source":"STAT:PT","width":10},
    {"key":"total_deductions","header":"Total Deductions (Rs.)","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Salary (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"signature","header":"Signature","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- GJ ESTABLISHMENT: Attendance Register (Form F - Gujarat S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('GJ', 'ESTABLISHMENT', 'MUSTER_ROLL',
  'Attendance Register (Form F - Gujarat Shops & Establishments Act)',
  'Monthly attendance register as prescribed under Gujarat Shops & Establishments Act, 1948',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days in Month","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Present","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Days Absent","source":"FIELD:lop_days","width":10},
    {"key":"ncp_days","header":"NCP Days","source":"FIELD:ncp_days","width":10},
    {"key":"ot_hours","header":"OT Hours","source":"FIELD:ot_hours","width":10},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- GJ ESTABLISHMENT: Leave Register (Form H - Gujarat S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('GJ', 'ESTABLISHMENT', 'LEAVE_REGISTER',
  'Leave Register (Form H - Gujarat Shops & Establishments Act)',
  'Register of leave as prescribed under Gujarat Shops & Establishments Act, 1948',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Present","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Leave Without Pay","source":"FIELD:lop_days","width":12},
    {"key":"el_balance","header":"Earned Leave Balance","source":"COMP:EL_BALANCE","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- GJ COMMON: Professional Tax Register (Gujarat PT slabs)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('GJ', 'COMMON', 'PT_REGISTER',
  'Professional Tax Register (Gujarat)',
  'Register of Professional Tax deductions as per Gujarat PT Act. Slabs: ≤12000=₹0, >12000=₹200/month (Feb=₹300)',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"gross_earnings","header":"Gross Salary (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pt","header":"PT Deducted (Rs.)","source":"STAT:PT","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":12}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;


-- =========================================================
-- DELHI (DL) - Delhi Factories Rules / Delhi S&E Act
-- =========================================================

-- DL FACTORY: Wage Register (Form D - Delhi Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('DL', 'FACTORY', 'WAGE_REGISTER',
  'Wage Register (Form D - Delhi Factories Rules)',
  'Monthly wage register as prescribed under Delhi Factories Rules',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation / Dept.","source":"FIELD:designation","width":15},
    {"key":"days_present","header":"No. of Days Worked","source":"FIELD:days_present","width":10},
    {"key":"basic","header":"Basic Wages (Rs.)","source":"COMP:BASIC","width":12},
    {"key":"hra","header":"HRA (Rs.)","source":"COMP:HRA","width":10},
    {"key":"other_allowances","header":"Other Allowances (Rs.)","source":"COMP:OTHERS","width":14},
    {"key":"att_bonus","header":"Attendance Bonus (Rs.)","source":"COMP:ATT_BONUS","width":14},
    {"key":"other_earnings","header":"Other Earnings (Rs.)","source":"COMP:OTHER_EARNINGS","width":13},
    {"key":"gross_earnings","header":"Total Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pf_emp","header":"PF Deduction (Rs.)","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI Deduction (Rs.)","source":"STAT:ESI_EMP","width":12},
    {"key":"total_deductions","header":"Total Deductions (Rs.)","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Wages Payable (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"signature","header":"Signature / Thumb Impression","source":"","width":18}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- DL FACTORY: Muster Roll (Form 25 - Delhi Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('DL', 'FACTORY', 'MUSTER_ROLL',
  'Muster Roll (Form 25 - Delhi Factories Rules)',
  'Monthly attendance / muster roll as prescribed under Delhi Factories Rules',
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

-- DL FACTORY: Overtime Register (Form IX - Delhi Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('DL', 'FACTORY', 'OVERTIME_REGISTER',
  'Overtime Register (Form IX - Delhi Factories Rules)',
  'Register of overtime work as prescribed under Delhi Factories Rules',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"days_present","header":"No. of Days Worked","source":"FIELD:days_present","width":10},
    {"key":"ot_hours","header":"Total OT Hours Worked","source":"FIELD:ot_hours","width":14},
    {"key":"basic","header":"Normal Rate of Wages (Rs.)","source":"COMP:BASIC","width":14},
    {"key":"gross_earnings","header":"Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"net_pay","header":"Net Wages Paid (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- DL FACTORY: Leave with Wages Register (Form 15 - Delhi Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('DL', 'FACTORY', 'LEAVE_REGISTER',
  'Leave with Wages Register (Form 15 - Delhi Factories Rules)',
  'Register of leave with wages as prescribed under Delhi Factories Rules',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days in Month","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Worked","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Leave Without Pay","source":"FIELD:lop_days","width":12},
    {"key":"ncp_days","header":"NCP Days","source":"FIELD:ncp_days","width":10},
    {"key":"el_balance","header":"Earned Leave Balance","source":"COMP:EL_BALANCE","width":12},
    {"key":"basic","header":"Basic Wages (Rs.)","source":"COMP:BASIC","width":12},
    {"key":"net_pay","header":"Net Pay (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- DL ESTABLISHMENT: Wage Register (Form B - Delhi S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('DL', 'ESTABLISHMENT', 'WAGE_REGISTER',
  'Wage Register (Form B - Delhi Shops & Establishments Act)',
  'Monthly wage register as prescribed under Delhi Shops & Establishments Act, 1954',
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
    {"key":"att_bonus","header":"Attendance Bonus (Rs.)","source":"COMP:ATT_BONUS","width":14},
    {"key":"other_earnings","header":"Other Earnings (Rs.)","source":"COMP:OTHER_EARNINGS","width":13},
    {"key":"gross_earnings","header":"Gross Salary (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pf_emp","header":"PF (Employee) (Rs.)","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI (Employee) (Rs.)","source":"STAT:ESI_EMP","width":12},
    {"key":"total_deductions","header":"Total Deductions (Rs.)","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Salary (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"signature","header":"Signature","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- DL ESTABLISHMENT: Attendance Register (Form A - Delhi S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('DL', 'ESTABLISHMENT', 'MUSTER_ROLL',
  'Attendance Register (Form A - Delhi Shops & Establishments Act)',
  'Monthly attendance register as prescribed under Delhi Shops & Establishments Act, 1954',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days in Month","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Present","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Days Absent","source":"FIELD:lop_days","width":10},
    {"key":"ncp_days","header":"NCP Days","source":"FIELD:ncp_days","width":10},
    {"key":"ot_hours","header":"OT Hours","source":"FIELD:ot_hours","width":10},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- DL ESTABLISHMENT: Leave Register (Form C - Delhi S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('DL', 'ESTABLISHMENT', 'LEAVE_REGISTER',
  'Leave Register (Form C - Delhi Shops & Establishments Act)',
  'Register of leave as prescribed under Delhi Shops & Establishments Act, 1954',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Present","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Leave Without Pay","source":"FIELD:lop_days","width":12},
    {"key":"el_balance","header":"Earned Leave Balance","source":"COMP:EL_BALANCE","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- Note: Delhi does NOT levy Professional Tax, so no DL PT_REGISTER override needed.
-- The ALL default PT_REGISTER will show zero values.


-- =========================================================
-- WEST BENGAL (WB) - WB Factories Rules / WB S&E Act
-- =========================================================

-- WB FACTORY: Wage Register (Form D - West Bengal Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('WB', 'FACTORY', 'WAGE_REGISTER',
  'Wage Register (Form D - West Bengal Factories Rules)',
  'Monthly wage register as prescribed under West Bengal Factories Rules, 1958',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation / Dept.","source":"FIELD:designation","width":15},
    {"key":"days_present","header":"No. of Days Worked","source":"FIELD:days_present","width":10},
    {"key":"basic","header":"Basic Wages (Rs.)","source":"COMP:BASIC","width":12},
    {"key":"hra","header":"HRA (Rs.)","source":"COMP:HRA","width":10},
    {"key":"other_allowances","header":"Other Allowances (Rs.)","source":"COMP:OTHERS","width":14},
    {"key":"att_bonus","header":"Attendance Bonus (Rs.)","source":"COMP:ATT_BONUS","width":14},
    {"key":"other_earnings","header":"Other Earnings (Rs.)","source":"COMP:OTHER_EARNINGS","width":13},
    {"key":"gross_earnings","header":"Total Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pf_emp","header":"PF Deduction (Rs.)","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI Deduction (Rs.)","source":"STAT:ESI_EMP","width":12},
    {"key":"pt","header":"Prof. Tax (Rs.)","source":"STAT:PT","width":10},
    {"key":"total_deductions","header":"Total Deductions (Rs.)","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Wages Payable (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"signature","header":"Signature / Thumb Impression","source":"","width":18}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- WB FACTORY: Muster Roll (Form 25 - WB Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('WB', 'FACTORY', 'MUSTER_ROLL',
  'Muster Roll (Form 25 - West Bengal Factories Rules)',
  'Monthly attendance / muster roll as prescribed under WB Factories Rules',
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

-- WB FACTORY: Overtime Register (Form IX - WB Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('WB', 'FACTORY', 'OVERTIME_REGISTER',
  'Overtime Register (Form IX - West Bengal Factories Rules)',
  'Register of overtime work as prescribed under WB Factories Rules',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"days_present","header":"No. of Days Worked","source":"FIELD:days_present","width":10},
    {"key":"ot_hours","header":"Total OT Hours Worked","source":"FIELD:ot_hours","width":14},
    {"key":"basic","header":"Normal Rate of Wages (Rs.)","source":"COMP:BASIC","width":14},
    {"key":"gross_earnings","header":"Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"net_pay","header":"Net Wages Paid (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- WB FACTORY: Leave with Wages Register (Form 15 - WB Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('WB', 'FACTORY', 'LEAVE_REGISTER',
  'Leave with Wages Register (Form 15 - West Bengal Factories Rules)',
  'Register of leave with wages as prescribed under WB Factories Rules',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days in Month","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Worked","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Leave Without Pay","source":"FIELD:lop_days","width":12},
    {"key":"ncp_days","header":"NCP Days","source":"FIELD:ncp_days","width":10},
    {"key":"el_balance","header":"Earned Leave Balance","source":"COMP:EL_BALANCE","width":12},
    {"key":"basic","header":"Basic Wages (Rs.)","source":"COMP:BASIC","width":12},
    {"key":"net_pay","header":"Net Pay (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- WB ESTABLISHMENT: Wage Register (Form O - WB S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('WB', 'ESTABLISHMENT', 'WAGE_REGISTER',
  'Wage Register (Form O - West Bengal Shops & Establishments Act)',
  'Monthly wage register as prescribed under WB Shops & Commercial Establishments Act, 1963',
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
    {"key":"att_bonus","header":"Attendance Bonus (Rs.)","source":"COMP:ATT_BONUS","width":14},
    {"key":"other_earnings","header":"Other Earnings (Rs.)","source":"COMP:OTHER_EARNINGS","width":13},
    {"key":"gross_earnings","header":"Gross Salary (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pf_emp","header":"PF (Employee) (Rs.)","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI (Employee) (Rs.)","source":"STAT:ESI_EMP","width":12},
    {"key":"pt","header":"Prof. Tax (Rs.)","source":"STAT:PT","width":10},
    {"key":"total_deductions","header":"Total Deductions (Rs.)","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Salary (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"signature","header":"Signature","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- WB ESTABLISHMENT: Attendance Register (Form N - WB S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('WB', 'ESTABLISHMENT', 'MUSTER_ROLL',
  'Attendance Register (Form N - West Bengal Shops & Establishments Act)',
  'Monthly attendance register as prescribed under WB Shops & Commercial Establishments Act',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days in Month","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Present","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Days Absent","source":"FIELD:lop_days","width":10},
    {"key":"ncp_days","header":"NCP Days","source":"FIELD:ncp_days","width":10},
    {"key":"ot_hours","header":"OT Hours","source":"FIELD:ot_hours","width":10},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- WB ESTABLISHMENT: Leave Register (Form P - WB S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('WB', 'ESTABLISHMENT', 'LEAVE_REGISTER',
  'Leave Register (Form P - West Bengal Shops & Establishments Act)',
  'Register of leave as prescribed under WB Shops & Commercial Establishments Act',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Present","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Leave Without Pay","source":"FIELD:lop_days","width":12},
    {"key":"el_balance","header":"Earned Leave Balance","source":"COMP:EL_BALANCE","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- WB COMMON: Professional Tax Register (West Bengal PT slabs)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('WB', 'COMMON', 'PT_REGISTER',
  'Professional Tax Register (West Bengal)',
  'Register of Professional Tax deductions as per WB State Tax on Professions Act. Slabs: ≤10000=₹0, 10001-15000=₹110, 15001-25000=₹130, 25001-40000=₹150, >40000=₹200/month',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"gross_earnings","header":"Gross Salary (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pt","header":"PT Deducted (Rs.)","source":"STAT:PT","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":12}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;


-- =========================================================
-- RAJASTHAN (RJ) - Rajasthan Factories Rules / RJ S&E Act
-- =========================================================

-- RJ FACTORY: Wage Register (Form D - Rajasthan Factories Rules)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('RJ', 'FACTORY', 'WAGE_REGISTER',
  'Wage Register (Form D - Rajasthan Factories Rules)',
  'Monthly wage register as prescribed under Rajasthan Factories Rules, 1951',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation / Dept.","source":"FIELD:designation","width":15},
    {"key":"days_present","header":"No. of Days Worked","source":"FIELD:days_present","width":10},
    {"key":"basic","header":"Basic Wages (Rs.)","source":"COMP:BASIC","width":12},
    {"key":"hra","header":"HRA (Rs.)","source":"COMP:HRA","width":10},
    {"key":"other_allowances","header":"Other Allowances (Rs.)","source":"COMP:OTHERS","width":14},
    {"key":"att_bonus","header":"Attendance Bonus (Rs.)","source":"COMP:ATT_BONUS","width":14},
    {"key":"other_earnings","header":"Other Earnings (Rs.)","source":"COMP:OTHER_EARNINGS","width":13},
    {"key":"gross_earnings","header":"Total Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pf_emp","header":"PF Deduction (Rs.)","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI Deduction (Rs.)","source":"STAT:ESI_EMP","width":12},
    {"key":"pt","header":"Prof. Tax (Rs.)","source":"STAT:PT","width":10},
    {"key":"total_deductions","header":"Total Deductions (Rs.)","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Wages Payable (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"signature","header":"Signature / Thumb Impression","source":"","width":18}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- RJ FACTORY: Muster Roll
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('RJ', 'FACTORY', 'MUSTER_ROLL',
  'Muster Roll (Form 25 - Rajasthan Factories Rules)',
  'Monthly attendance / muster roll as prescribed under Rajasthan Factories Rules',
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

-- RJ FACTORY: Overtime Register
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('RJ', 'FACTORY', 'OVERTIME_REGISTER',
  'Overtime Register (Form IX - Rajasthan Factories Rules)',
  'Register of overtime work as prescribed under Rajasthan Factories Rules',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"days_present","header":"No. of Days Worked","source":"FIELD:days_present","width":10},
    {"key":"ot_hours","header":"Total OT Hours Worked","source":"FIELD:ot_hours","width":14},
    {"key":"basic","header":"Normal Rate of Wages (Rs.)","source":"COMP:BASIC","width":14},
    {"key":"gross_earnings","header":"Gross Wages (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"net_pay","header":"Net Wages Paid (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- RJ FACTORY: Leave Register
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('RJ', 'FACTORY', 'LEAVE_REGISTER',
  'Leave with Wages Register (Form 15 - Rajasthan Factories Rules)',
  'Register of leave with wages as prescribed under Rajasthan Factories Rules',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days in Month","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Worked","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Leave Without Pay","source":"FIELD:lop_days","width":12},
    {"key":"ncp_days","header":"NCP Days","source":"FIELD:ncp_days","width":10},
    {"key":"el_balance","header":"Earned Leave Balance","source":"COMP:EL_BALANCE","width":12},
    {"key":"basic","header":"Basic Wages (Rs.)","source":"COMP:BASIC","width":12},
    {"key":"net_pay","header":"Net Pay (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- RJ ESTABLISHMENT: Wage Register (Form XII - RJ S&E Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('RJ', 'ESTABLISHMENT', 'WAGE_REGISTER',
  'Wage Register (Form XII - Rajasthan Shops & Establishments Act)',
  'Monthly wage register as prescribed under Rajasthan Shops & Commercial Establishments Act, 1958',
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
    {"key":"att_bonus","header":"Attendance Bonus (Rs.)","source":"COMP:ATT_BONUS","width":14},
    {"key":"other_earnings","header":"Other Earnings (Rs.)","source":"COMP:OTHER_EARNINGS","width":13},
    {"key":"gross_earnings","header":"Gross Salary (Rs.)","source":"CALC:gross_earnings","width":13},
    {"key":"pf_emp","header":"PF (Employee) (Rs.)","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI (Employee) (Rs.)","source":"STAT:ESI_EMP","width":12},
    {"key":"pt","header":"Prof. Tax (Rs.)","source":"STAT:PT","width":10},
    {"key":"total_deductions","header":"Total Deductions (Rs.)","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Salary (Rs.)","source":"CALC:net_pay","width":13},
    {"key":"signature","header":"Signature","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- RJ ESTABLISHMENT: Attendance Register
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('RJ', 'ESTABLISHMENT', 'MUSTER_ROLL',
  'Attendance Register (Form X - Rajasthan Shops & Establishments Act)',
  'Monthly attendance register as prescribed under Rajasthan S&E Act',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days in Month","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Present","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Days Absent","source":"FIELD:lop_days","width":10},
    {"key":"ncp_days","header":"NCP Days","source":"FIELD:ncp_days","width":10},
    {"key":"ot_hours","header":"OT Hours","source":"FIELD:ot_hours","width":10},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- RJ ESTABLISHMENT: Leave Register
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('RJ', 'ESTABLISHMENT', 'LEAVE_REGISTER',
  'Leave Register (Form XI - Rajasthan Shops & Establishments Act)',
  'Register of leave as prescribed under Rajasthan S&E Act',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":12},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"father_name","header":"Father''s Name","source":"FIELD:father_name","width":20},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":14},
    {"key":"total_days","header":"Total Days","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Present","source":"FIELD:days_present","width":10},
    {"key":"lop_days","header":"Leave Without Pay","source":"FIELD:lop_days","width":12},
    {"key":"el_balance","header":"Earned Leave Balance","source":"COMP:EL_BALANCE","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- RJ COMMON: Professional Tax Register (Rajasthan - No PT)
-- Note: Rajasthan does NOT levy Professional Tax
-- No override needed, ALL default PT_REGISTER will show zero values.


-- =========================================================
-- SUMMARY
-- =========================================================
-- States covered: TS (Telangana), AP (Andhra Pradesh), KA (Karnataka),
--   TN (Tamil Nadu), MH (Maharashtra), GJ (Gujarat), DL (Delhi),
--   WB (West Bengal), RJ (Rajasthan)
-- Templates per state: 8 (4 FACTORY + 3 ESTABLISHMENT + 1 PT_REGISTER common)
--   Exception: DL, TN, RJ have 7 (no PT as state doesn't levy it or uses NIL)
-- Total new templates: ~68
-- Key differences by state:
--   - Form numbers match state-specific rules (e.g., KA Form XVII vs MH Form D)
--   - Father's/Husband's Name column added in all state templates
--   - PT slabs documented in description for each state
--   - TN and DL and RJ: No Professional Tax levy
--   - MH: Gender-based PT slabs
--   - WB: Multi-slab PT structure
-- =========================================================
