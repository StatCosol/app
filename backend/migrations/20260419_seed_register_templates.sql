-- ============================================================
-- Seed register templates for branch-type-based generation
-- establishment_type: FACTORY | ESTABLISHMENT | COMMON
-- state_code = 'ALL' = default national format (state-specific can override)
-- ============================================================

-- =========================================
-- FACTORY-SPECIFIC REGISTERS
-- =========================================

-- 1. Wage Register (Form D / Form XVII - Factories Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('ALL', 'FACTORY', 'WAGE_REGISTER',
  'Wage Register (Form D - Factories Act)',
  'Monthly wage register as prescribed under Factories Act / Payment of Wages Act',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":14},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":15},
    {"key":"days_present","header":"Days Worked","source":"FIELD:days_present","width":10},
    {"key":"basic","header":"Basic Wages","source":"COMP:BASIC","width":12},
    {"key":"hra","header":"HRA","source":"COMP:HRA","width":10},
    {"key":"other_allowances","header":"Other Allowances","source":"COMP:OTHERS","width":14},
    {"key":"att_bonus","header":"Attendance Bonus","source":"COMP:ATT_BONUS","width":14},
    {"key":"other_earnings","header":"Other Earnings","source":"COMP:OTHER_EARNINGS","width":13},
    {"key":"gross_earnings","header":"Gross Earnings","source":"CALC:gross_earnings","width":13},
    {"key":"pf_emp","header":"PF (Employee)","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI (Employee)","source":"STAT:ESI_EMP","width":12},
    {"key":"pt","header":"Prof. Tax","source":"STAT:PT","width":10},
    {"key":"total_deductions","header":"Total Deductions","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Pay","source":"CALC:net_pay","width":13},
    {"key":"signature","header":"Signature / Thumb Impression","source":"","width":18}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- 2. Muster Roll (Form F / Form 25 - Factories Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('ALL', 'FACTORY', 'MUSTER_ROLL',
  'Muster Roll (Form F - Factories Act)',
  'Monthly attendance / muster roll as prescribed under Factories Act',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":14},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":15},
    {"key":"total_days","header":"Total Days in Month","source":"FIELD:total_days","width":12},
    {"key":"days_present","header":"Days Present","source":"FIELD:days_present","width":11},
    {"key":"lop_days","header":"Days Absent (LOP)","source":"FIELD:lop_days","width":13},
    {"key":"ncp_days","header":"NCP Days","source":"FIELD:ncp_days","width":10},
    {"key":"ot_hours","header":"OT Hours","source":"FIELD:ot_hours","width":10},
    {"key":"gross_earnings","header":"Gross Wages","source":"CALC:gross_earnings","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- 3. Overtime Register (Form IX - Factories Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('ALL', 'FACTORY', 'OVERTIME_REGISTER',
  'Overtime Register (Form IX - Factories Act)',
  'Register of overtime work as prescribed under Factories Act',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":14},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":15},
    {"key":"days_present","header":"Days Worked","source":"FIELD:days_present","width":10},
    {"key":"ot_hours","header":"Overtime Hours Worked","source":"FIELD:ot_hours","width":16},
    {"key":"basic","header":"Normal Wages (Basic)","source":"COMP:BASIC","width":14},
    {"key":"gross_earnings","header":"Gross Wages","source":"CALC:gross_earnings","width":13},
    {"key":"net_pay","header":"Net Wages Paid","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- 4. Leave with Wages Register (Form 15 - Factories Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('ALL', 'FACTORY', 'LEAVE_REGISTER',
  'Leave with Wages Register (Form 15 - Factories Act)',
  'Register of leave with wages as prescribed under Factories Act',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":14},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":15},
    {"key":"total_days","header":"Total Days","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Present","source":"FIELD:days_present","width":11},
    {"key":"lop_days","header":"Leave Without Pay","source":"FIELD:lop_days","width":14},
    {"key":"ncp_days","header":"NCP Days","source":"FIELD:ncp_days","width":10},
    {"key":"el_balance","header":"EL Balance","source":"COMP:EL_BALANCE","width":11},
    {"key":"basic","header":"Wages (Basic)","source":"COMP:BASIC","width":12},
    {"key":"net_pay","header":"Net Pay","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- =========================================
-- ESTABLISHMENT / S&E REGISTERS
-- =========================================

-- 5. Wage Register (Shops & Establishments Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('ALL', 'ESTABLISHMENT', 'WAGE_REGISTER',
  'Wage Register (Shops & Establishments Act)',
  'Monthly wage register as prescribed under the applicable Shops & Establishments Act',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":14},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":15},
    {"key":"days_present","header":"Days Worked","source":"FIELD:days_present","width":10},
    {"key":"basic","header":"Basic Wages","source":"COMP:BASIC","width":12},
    {"key":"hra","header":"HRA","source":"COMP:HRA","width":10},
    {"key":"other_allowances","header":"Other Allowances","source":"COMP:OTHERS","width":14},
    {"key":"att_bonus","header":"Attendance Bonus","source":"COMP:ATT_BONUS","width":14},
    {"key":"other_earnings","header":"Other Earnings","source":"COMP:OTHER_EARNINGS","width":13},
    {"key":"gross_earnings","header":"Gross Salary","source":"CALC:gross_earnings","width":13},
    {"key":"pf_emp","header":"PF (Employee)","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI (Employee)","source":"STAT:ESI_EMP","width":12},
    {"key":"pt","header":"Prof. Tax","source":"STAT:PT","width":10},
    {"key":"total_deductions","header":"Total Deductions","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Salary","source":"CALC:net_pay","width":13},
    {"key":"signature","header":"Signature","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- 6. Attendance Register (Shops & Establishments Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('ALL', 'ESTABLISHMENT', 'MUSTER_ROLL',
  'Attendance Register (Shops & Establishments Act)',
  'Monthly attendance register as prescribed under the applicable Shops & Establishments Act',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":14},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":15},
    {"key":"total_days","header":"Total Days in Month","source":"FIELD:total_days","width":12},
    {"key":"days_present","header":"Days Present","source":"FIELD:days_present","width":11},
    {"key":"lop_days","header":"Days Absent","source":"FIELD:lop_days","width":11},
    {"key":"ncp_days","header":"NCP Days","source":"FIELD:ncp_days","width":10},
    {"key":"ot_hours","header":"OT Hours","source":"FIELD:ot_hours","width":10},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- 7. Leave Register (Shops & Establishments Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('ALL', 'ESTABLISHMENT', 'LEAVE_REGISTER',
  'Leave Register (Shops & Establishments Act)',
  'Register of leave as prescribed under the applicable Shops & Establishments Act',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":14},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":15},
    {"key":"total_days","header":"Total Days","source":"FIELD:total_days","width":10},
    {"key":"days_present","header":"Days Present","source":"FIELD:days_present","width":11},
    {"key":"lop_days","header":"Leave Without Pay","source":"FIELD:lop_days","width":14},
    {"key":"el_balance","header":"EL Balance","source":"COMP:EL_BALANCE","width":11},
    {"key":"remarks","header":"Remarks","source":"","width":15}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- =========================================
-- COMMON REGISTERS (Apply to ALL branch types)
-- =========================================

-- 8. PF Contribution Register
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('ALL', 'COMMON', 'PF_REGISTER',
  'PF Contribution Register',
  'Provident Fund contribution working sheet (Employee & Employer share)',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":14},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"uan","header":"UAN","source":"FIELD:uan","width":16},
    {"key":"basic","header":"PF Wages (Basic)","source":"COMP:BASIC","width":13},
    {"key":"pf_emp","header":"Employee PF (12%)","source":"STAT:PF_EMP","width":14},
    {"key":"pf_er","header":"Employer PF","source":"STAT:PF_ER","width":13},
    {"key":"total_pf","header":"Total PF","source":"FIELD:total_pf","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":12}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- 9. ESI Contribution Register
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('ALL', 'COMMON', 'ESI_REGISTER',
  'ESI Contribution Register',
  'ESI contribution working sheet (Employee & Employer share)',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":14},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"esic","header":"ESIC No.","source":"FIELD:esic","width":16},
    {"key":"gross_earnings","header":"ESI Wages (Gross)","source":"CALC:gross_earnings","width":14},
    {"key":"esi_emp","header":"Employee ESI (0.75%)","source":"STAT:ESI_EMP","width":15},
    {"key":"esi_er","header":"Employer ESI (3.25%)","source":"STAT:ESI_ER","width":15},
    {"key":"total_esi","header":"Total ESI","source":"FIELD:total_esi","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":12}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- 10. Professional Tax Register
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('ALL', 'COMMON', 'PT_REGISTER',
  'Professional Tax Register',
  'Register of Professional Tax deductions',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":14},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":15},
    {"key":"gross_earnings","header":"Gross Salary","source":"CALC:gross_earnings","width":13},
    {"key":"pt","header":"PT Deducted","source":"STAT:PT","width":12},
    {"key":"remarks","header":"Remarks","source":"","width":12}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- 11. Register of Deductions (Form E - Payment of Wages Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('ALL', 'COMMON', 'DEDUCTION_REGISTER',
  'Register of Deductions (Form E)',
  'Register of deductions from wages as per Payment of Wages Act',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":14},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":15},
    {"key":"gross_earnings","header":"Gross Wages","source":"CALC:gross_earnings","width":13},
    {"key":"pf_emp","header":"PF Deduction","source":"STAT:PF_EMP","width":12},
    {"key":"esi_emp","header":"ESI Deduction","source":"STAT:ESI_EMP","width":12},
    {"key":"pt","header":"Prof. Tax","source":"STAT:PT","width":10},
    {"key":"total_deductions","header":"Total Deductions","source":"CALC:total_deductions","width":14},
    {"key":"net_pay","header":"Net Pay","source":"CALC:net_pay","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":12}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;

-- 12. Bonus Register (Payment of Bonus Act)
INSERT INTO register_templates (state_code, establishment_type, register_type, title, description, column_definitions)
VALUES ('ALL', 'COMMON', 'BONUS_REGISTER',
  'Bonus Register (Payment of Bonus Act)',
  'Register under Payment of Bonus Act, 1965',
  '[
    {"key":"serial","header":"S.No.","source":"FIELD:serial","width":6},
    {"key":"employee_code","header":"Emp Code","source":"FIELD:employee_code","width":14},
    {"key":"employee_name","header":"Name of Employee","source":"FIELD:employee_name","width":24},
    {"key":"designation","header":"Designation","source":"FIELD:designation","width":15},
    {"key":"basic","header":"Basic + DA","source":"COMP:BASIC","width":12},
    {"key":"gross_earnings","header":"Gross Salary","source":"CALC:gross_earnings","width":13},
    {"key":"days_present","header":"Days Worked","source":"FIELD:days_present","width":10},
    {"key":"bonus_amount","header":"Bonus Amount","source":"COMP:BONUS","width":13},
    {"key":"remarks","header":"Remarks","source":"","width":12}
  ]'::jsonb)
ON CONFLICT (state_code, establishment_type, register_type) DO NOTHING;
