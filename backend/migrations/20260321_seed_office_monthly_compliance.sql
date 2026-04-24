-- Seed: Office / Establishment Monthly Compliance Master Data
-- Date: 2026-03-21
-- Office compliance items for branches governed by Shops & Establishments

-- Some environments still have law_area as VARCHAR(40) from earlier schema.
-- Widen it before inserting office seed rows with longer labels.
ALTER TABLE compliance_return_master
  ALTER COLUMN law_area TYPE VARCHAR(100);

-- Step 1: Update shared PF/ESI/PT/LWF codes from FACTORY → BOTH
UPDATE compliance_return_master
SET applies_to = 'BOTH', updated_at = NOW()
WHERE return_code IN (
  'PF_ECR', 'PF_CHALLAN', 'PF_WAGE_RECON',
  'ESI_CHALLAN', 'ESI_WAGE_RECON',
  'PT_AP', 'PT_TS', 'PT_KA', 'PT_TN_TRACK', 'PT_MH',
  'LWF_AP', 'LWF_TS', 'LWF_KA', 'LWF_TN', 'LWF_MH'
)
AND applies_to = 'FACTORY';

-- Step 2: Insert new office-specific items
INSERT INTO compliance_return_master
  (return_code, return_name, law_area, category, state_code, frequency, applies_to, upload_required, due_date_rule, risk_level, responsible_role, scope_default, applicable_for, remarks, is_active)
VALUES
  -- ── Attendance, Wages & Leave ──────────────────────
  ('OFF_ATTENDANCE',      'Attendance / Muster Record',          'Shops & Establishments / Wage Records',     'LABOUR', 'ALL', 'MONTHLY', 'OFFICE', true,  'MONTH_END',                     'HIGH',   'BRANCH_USER',   'BRANCH', 'BOTH', 'Base record for wages, leave and attendance verification', true),
  ('OFF_SALARY_REGISTER', 'Salary / Wage Register',              'Payment of Wages / Minimum Wages',          'LABOUR', 'ALL', 'MONTHLY', 'OFFICE', true,  'MONTH_END',                     'HIGH',   'BRANCH_USER',   'BRANCH', 'BOTH', 'Must match attendance and bank transfer', true),
  ('OFF_PAYSLIPS',        'Payslips / Salary Sheets',            'Wage Compliance',                           'LABOUR', 'ALL', 'MONTHLY', 'OFFICE', true,  'MONTH_END',                     'MEDIUM', 'BRANCH_USER',   'BRANCH', 'BOTH', 'Employee-wise payslip issue proof', true),
  ('OFF_BANK_PROOF',      'Salary Bank Transfer Proof',          'Wage Payment Proof',                        'LABOUR', 'ALL', 'MONTHLY', 'OFFICE', true,  'MONTH_END',                     'HIGH',   'BRANCH_USER',   'BRANCH', 'BOTH', 'NEFT/RTGS/bank statement for salary disbursement', true),
  ('OFF_MIN_WAGE_CHECK',  'Minimum Wage Comparison Sheet',       'Minimum Wages Act',                         'LABOUR', 'ALL', 'MONTHLY', 'OFFICE', true,  'MONTH_END',                     'HIGH',   'BRANCH_USER',   'BRANCH', 'BOTH', 'Monthly wage comparison with notified minimum wages', true),
  ('OFF_LEAVE_REGISTER',  'Leave Register',                      'Shops & Establishments / Leave Rules',      'LABOUR', 'ALL', 'MONTHLY', 'OFFICE', true,  'MONTH_END',                     'MEDIUM', 'BRANCH_USER',   'BRANCH', 'BOTH', 'CL / SL / EL / privilege leave tracking', true),
  ('OFF_HOLIDAY_RECORD',  'Weekly Off / Holiday Record',         'Shops & Establishments / Holiday Compliance','LABOUR', 'ALL', 'MONTHLY', 'OFFICE', true,  'MONTH_END',                     'MEDIUM', 'BRANCH_USER',   'BRANCH', 'BOTH', 'Weekly off and holiday work record', true),
  ('OFF_WORKING_HOURS',   'Working Hours / Shift Schedule',      'Shops & Establishments',                    'LABOUR', 'ALL', 'MONTHLY', 'OFFICE', true,  'MONTH_END',                     'MEDIUM', 'BRANCH_USER',   'BRANCH', 'BOTH', 'Office timing, spread-over, and shift schedule', true),
  ('OFF_OT_REGISTER',     'Overtime / Extra Hours Register',     'Shops & Establishments',                    'LABOUR', 'ALL', 'MONTHLY', 'OFFICE', false, 'MONTH_END',                     'HIGH',   'BRANCH_USER',   'BRANCH', 'BOTH', 'Upload where OT or extra hours compensation is applicable', true),
  ('OFF_FINE_DEDUCT',     'Fine / Deduction / Advance Register', 'Payment of Wages',                          'LABOUR', 'ALL', 'MONTHLY', 'OFFICE', false, 'MONTH_END',                     'MEDIUM', 'BRANCH_USER',   'BRANCH', 'BOTH', 'Maintain if any deduction, fine, or advance exists', true),

  -- ── PF / ESI (office-specific codes) ───────────────
  ('PF_WORKING',   'PF Contribution Working',   'EPF Act', 'LABOUR', 'ALL', 'MONTHLY', 'OFFICE', true, 'ON_OR_BEFORE_15TH_NEXT_MONTH', 'HIGH', 'BRANCH_USER',   'BRANCH', 'BOTH', 'Employee-wise PF working sheet', true),
  ('ESI_RETURN',   'ESI Contribution Return',   'ESI Act', 'LABOUR', 'ALL', 'MONTHLY', 'OFFICE', true, 'ON_OR_BEFORE_15TH_NEXT_MONTH', 'HIGH', 'CLIENT_MASTER', 'BRANCH', 'BOTH', 'Portal filing proof', true),
  ('ESI_WORKING',  'ESI Contribution Working',  'ESI Act', 'LABOUR', 'ALL', 'MONTHLY', 'OFFICE', true, 'ON_OR_BEFORE_15TH_NEXT_MONTH', 'HIGH', 'BRANCH_USER',   'BRANCH', 'BOTH', 'IP-wise wage and contribution sheet', true),

  -- ── HR Compliance ──────────────────────────────────
  ('MB_RECORDS', 'Maternity Benefit Records',            'Maternity Benefit Act', 'LABOUR',        'ALL', 'MONTHLY', 'OFFICE', false, 'CASE_BASED', 'MEDIUM', 'BRANCH_USER',   'BRANCH', 'BOTH', 'Maintain where any maternity case exists', true),
  ('POSH_IC',    'POSH Internal Committee / Case Log',   'POSH Act',              'HR_COMPLIANCE', 'ALL', 'MONTHLY', 'OFFICE', false, 'CASE_BASED', 'HIGH',   'CLIENT_MASTER', 'BRANCH', 'BOTH', 'Monthly governance tracker / case log / nil tracking', true),

  -- ── Shops & Establishments Registration (state-wise) ─
  ('SE_AP_CERT', 'Shops & Establishment Registration / Validity Proof',               'State Shops & Establishments Law', 'LICENSE', 'AP', 'MONTHLY', 'OFFICE', false, 'VALIDITY_TRACKING', 'HIGH', 'CLIENT_MASTER', 'BRANCH', 'BOTH', 'Keep registration certificate and amendment proof', true),
  ('SE_TS_CERT', 'Shops & Establishments Registration / Validity Proof',              'State Shops & Establishments Law', 'LICENSE', 'TS', 'MONTHLY', 'OFFICE', false, 'VALIDITY_TRACKING', 'HIGH', 'CLIENT_MASTER', 'BRANCH', 'BOTH', 'Keep registration certificate and annual fee validity proof', true),
  ('SE_KA_CERT', 'Shops & Commercial Establishment Registration / Return Proof',      'State Shops & Establishments Law', 'LICENSE', 'KA', 'MONTHLY', 'OFFICE', false, 'VALIDITY_TRACKING', 'HIGH', 'CLIENT_MASTER', 'BRANCH', 'BOTH', 'Keep registration, amendment, and annual return trail', true),
  ('SE_TN_CERT', 'Shops & Establishments Registration Proof',                         'State Shops & Establishments Law', 'LICENSE', 'TN', 'MONTHLY', 'OFFICE', false, 'VALIDITY_TRACKING', 'HIGH', 'CLIENT_MASTER', 'BRANCH', 'BOTH', 'Keep registration and amendment proof', true),
  ('SE_MH_CERT', 'Shops & Establishments Registration / Fee Proof',                   'State Shops & Establishments Law', 'LICENSE', 'MH', 'MONTHLY', 'OFFICE', false, 'VALIDITY_TRACKING', 'HIGH', 'CLIENT_MASTER', 'BRANCH', 'BOTH', 'Keep registration, amendment, and fee payment trail', true)

ON CONFLICT (return_code) DO UPDATE SET
  return_name      = EXCLUDED.return_name,
  law_area         = EXCLUDED.law_area,
  category         = EXCLUDED.category,
  state_code       = EXCLUDED.state_code,
  frequency        = EXCLUDED.frequency,
  applies_to       = EXCLUDED.applies_to,
  upload_required  = EXCLUDED.upload_required,
  due_date_rule    = EXCLUDED.due_date_rule,
  risk_level       = EXCLUDED.risk_level,
  responsible_role = EXCLUDED.responsible_role,
  remarks          = EXCLUDED.remarks,
  is_active        = EXCLUDED.is_active,
  updated_at       = NOW();
