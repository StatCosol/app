-- Seed: Factory + Shared Monthly Compliance Master Data
-- Date: 2026-03-21
-- 33 items: 11 factory-only (FACT_*, SAFE_*, FORM_XII) + 22 shared (BOTH)

INSERT INTO compliance_return_master
  (return_code, return_name, law_area, category, state_code, frequency, applies_to, upload_required, due_date_rule, risk_level, responsible_role, scope_default, applicable_for, remarks, is_active)
VALUES
  ('FACT_ADULT_WORKERS', 'Register of Adult Workers', 'Factories Act', 'FACTORY', 'ALL', 'MONTHLY', 'FACTORY', true, 'MONTH_END', 'HIGH', 'BRANCH_USER', 'BRANCH', 'BOTH', 'Monthly updated copy / current month status', true),
  ('FACT_OT_REGISTER', 'Overtime Register', 'Factories Act', 'FACTORY', 'ALL', 'MONTHLY', 'FACTORY', true, 'MONTH_END', 'HIGH', 'BRANCH_USER', 'BRANCH', 'BOTH', 'OT hours and wages to match payroll', true),
  ('FACT_ACCIDENT_REGISTER', 'Accident Register', 'Factories Act', 'FACTORY', 'ALL', 'MONTHLY', 'FACTORY', true, 'MONTH_END', 'HIGH', 'BRANCH_USER', 'BRANCH', 'BOTH', 'Nil submission allowed where no accident occurred', true),
  ('FACT_LEAVE_REGISTER', 'Leave with Wages Register', 'Factories Act', 'FACTORY', 'ALL', 'MONTHLY', 'FACTORY', true, 'MONTH_END', 'MEDIUM', 'BRANCH_USER', 'BRANCH', 'BOTH', 'Updated leave entries', true),
  ('FACT_SHIFT_SCHEDULE', 'Shift / Working Hours Schedule', 'Factories Act', 'FACTORY', 'AP,TS', 'MONTHLY', 'FACTORY', true, 'MONTH_END', 'MEDIUM', 'BRANCH_USER', 'BRANCH', 'BOTH', 'Displayed and maintained shift timing', true),

  ('LAB_ATTENDANCE', 'Attendance / Muster Roll', 'Minimum Wages / Payment of Wages', 'LABOUR', 'ALL', 'MONTHLY', 'BOTH', true, 'MONTH_END', 'HIGH', 'BRANCH_USER', 'BRANCH', 'BOTH', 'Base document for wages and PF/ESI', true),
  ('LAB_WAGE_REGISTER', 'Wage Register', 'Payment of Wages Act', 'LABOUR', 'ALL', 'MONTHLY', 'BOTH', true, 'MONTH_END', 'HIGH', 'BRANCH_USER', 'BRANCH', 'BOTH', 'Must match attendance and bank transfer', true),
  ('LAB_PAYSLIPS', 'Payslips', 'Payment of Wages Act', 'LABOUR', 'ALL', 'MONTHLY', 'BOTH', true, 'MONTH_END', 'MEDIUM', 'BRANCH_USER', 'BRANCH', 'BOTH', 'Employee-wise issue proof', true),
  ('LAB_MIN_WAGE_CHECK', 'Minimum Wages Compliance Sheet', 'Minimum Wages Act', 'LABOUR', 'ALL', 'MONTHLY', 'BOTH', true, 'MONTH_END', 'HIGH', 'BRANCH_USER', 'BRANCH', 'BOTH', 'Monthly wage vs notified minimum wage', true),
  ('LAB_DEDUCTION_REGISTER', 'Deduction Register', 'Payment of Wages Act', 'LABOUR', 'AP,TS', 'MONTHLY', 'BOTH', true, 'MONTH_END', 'MEDIUM', 'BRANCH_USER', 'BRANCH', 'BOTH', 'Advances, fines, damages', true),
  ('LAB_LEAVE_RECORDS', 'Leave Records', 'Factories Act / Leave Rules', 'LABOUR', 'ALL', 'MONTHLY', 'BOTH', true, 'MONTH_END', 'MEDIUM', 'BRANCH_USER', 'BRANCH', 'BOTH', 'CL / SL / EL as applicable', true),

  ('PF_ECR', 'PF ECR Return', 'EPF Act', 'LABOUR', 'ALL', 'MONTHLY', 'BOTH', true, 'ON_OR_BEFORE_15TH_NEXT_MONTH', 'HIGH', 'CLIENT_MASTER', 'BRANCH', 'BOTH', 'Portal filing proof', true),
  ('PF_CHALLAN', 'PF Challan', 'EPF Act', 'LABOUR', 'ALL', 'MONTHLY', 'BOTH', true, 'ON_OR_BEFORE_15TH_NEXT_MONTH', 'HIGH', 'CLIENT_MASTER', 'BRANCH', 'BOTH', 'TRRN and payment proof', true),
  ('PF_CONTRIBUTION_SHEET', 'PF Contribution Working', 'EPF Act', 'LABOUR', 'ALL', 'MONTHLY', 'BOTH', true, 'ON_OR_BEFORE_15TH_NEXT_MONTH', 'HIGH', 'BRANCH_USER', 'BRANCH', 'BOTH', 'Employee-wise PF sheet', true),
  ('PF_WAGE_RECON', 'PF Wage Reconciliation', 'EPF Act', 'LABOUR', 'ALL', 'MONTHLY', 'BOTH', true, 'ON_OR_BEFORE_15TH_NEXT_MONTH', 'HIGH', 'CRM', 'BRANCH', 'BOTH', 'Payroll vs PF reconciliation', true),

  ('ESI_CONTRIBUTION', 'ESI Contribution Return', 'ESI Act', 'LABOUR', 'ALL', 'MONTHLY', 'BOTH', true, 'ON_OR_BEFORE_15TH_NEXT_MONTH', 'HIGH', 'CLIENT_MASTER', 'BRANCH', 'BOTH', 'Portal contribution filing', true),
  ('ESI_CHALLAN', 'ESI Challan', 'ESI Act', 'LABOUR', 'ALL', 'MONTHLY', 'BOTH', true, 'ON_OR_BEFORE_15TH_NEXT_MONTH', 'HIGH', 'CLIENT_MASTER', 'BRANCH', 'BOTH', 'Payment proof', true),
  ('ESI_EMPLOYEE_SHEET', 'ESI Employee Working', 'ESI Act', 'LABOUR', 'ALL', 'MONTHLY', 'BOTH', true, 'ON_OR_BEFORE_15TH_NEXT_MONTH', 'HIGH', 'BRANCH_USER', 'BRANCH', 'BOTH', 'IP-wise wage and contribution', true),
  ('ESI_WAGE_RECON', 'ESI Wage Reconciliation', 'ESI Act', 'LABOUR', 'ALL', 'MONTHLY', 'BOTH', true, 'ON_OR_BEFORE_15TH_NEXT_MONTH', 'HIGH', 'CRM', 'BRANCH', 'BOTH', 'Payroll vs ESI reconciliation', true),

  ('PT_AP', 'Professional Tax', 'State PT Law', 'TAX', 'AP', 'MONTHLY', 'BOTH', true, 'STATE_SPECIFIC', 'MEDIUM', 'CLIENT_MASTER', 'BRANCH', 'BOTH', 'Monthly where applicable', true),
  ('PT_TS', 'Professional Tax', 'State PT Law', 'TAX', 'TS', 'MONTHLY', 'BOTH', true, 'ON_OR_BEFORE_10TH_NEXT_MONTH', 'MEDIUM', 'CLIENT_MASTER', 'BRANCH', 'BOTH', 'Monthly return/payment tracking', true),
  ('PT_KA', 'Professional Tax', 'State PT Law', 'TAX', 'KA', 'MONTHLY', 'BOTH', true, 'STATE_SPECIFIC', 'MEDIUM', 'CLIENT_MASTER', 'BRANCH', 'BOTH', 'Monthly compliance', true),
  ('PT_TN_TRACK', 'Professional Tax Deduction Tracking', 'State PT Law', 'TAX', 'TN', 'MONTHLY', 'BOTH', true, 'STATE_SPECIFIC', 'LOW', 'BRANCH_USER', 'BRANCH', 'BOTH', 'Deduction monthly, return as applicable', true),
  ('PT_MH', 'Professional Tax', 'State PT Law', 'TAX', 'MH', 'MONTHLY', 'BOTH', true, 'STATE_SPECIFIC', 'MEDIUM', 'CLIENT_MASTER', 'BRANCH', 'BOTH', 'Monthly / periodic as configured', true),

  ('LWF_AP', 'Labour Welfare Fund', 'State LWF Law', 'TAX', 'AP', 'MONTHLY', 'BOTH', false, 'CONTRIBUTION_MONTH_ONLY', 'LOW', 'CLIENT_MASTER', 'BRANCH', 'BOTH', 'Upload if contribution month applies', true),
  ('LWF_TS', 'Labour Welfare Fund', 'State LWF Law', 'TAX', 'TS', 'MONTHLY', 'BOTH', false, 'CONTRIBUTION_MONTH_ONLY', 'LOW', 'CLIENT_MASTER', 'BRANCH', 'BOTH', 'Upload if contribution month applies', true),
  ('LWF_KA', 'Labour Welfare Fund', 'State LWF Law', 'TAX', 'KA', 'MONTHLY', 'BOTH', false, 'CONTRIBUTION_MONTH_ONLY', 'LOW', 'CLIENT_MASTER', 'BRANCH', 'BOTH', 'Upload if contribution month applies', true),
  ('LWF_TN', 'Labour Welfare Fund', 'State LWF Law', 'TAX', 'TN', 'MONTHLY', 'BOTH', false, 'CONTRIBUTION_MONTH_ONLY', 'LOW', 'CLIENT_MASTER', 'BRANCH', 'BOTH', 'Upload if contribution month applies', true),
  ('LWF_MH', 'Labour Welfare Fund', 'State LWF Law', 'TAX', 'MH', 'MONTHLY', 'BOTH', false, 'CONTRIBUTION_MONTH_ONLY', 'LOW', 'CLIENT_MASTER', 'BRANCH', 'BOTH', 'Upload if contribution month applies', true),

  ('SAFE_PPE_REGISTER', 'PPE Issue Register', 'Factories Act / Safety', 'SAFETY', 'ALL', 'MONTHLY', 'FACTORY', true, 'MONTH_END', 'MEDIUM', 'BRANCH_USER', 'BRANCH', 'BOTH', 'PPE issue and replacement record', true),
  ('SAFE_FIRST_AID', 'First Aid Register', 'Factories Act / Safety', 'SAFETY', 'ALL', 'MONTHLY', 'FACTORY', true, 'MONTH_END', 'MEDIUM', 'BRANCH_USER', 'BRANCH', 'BOTH', 'Treatment entries', true),
  ('SAFE_TRAINING', 'Safety Training Records', 'Factories Act / Safety', 'SAFETY', 'ALL', 'MONTHLY', 'FACTORY', true, 'MONTH_END', 'MEDIUM', 'BRANCH_USER', 'BRANCH', 'BOTH', 'Toolbox talk / induction / refresher', true),

  ('FORM_XII', 'Register of Contractors', 'CLRA Act', 'LABOUR', 'ALL', 'MONTHLY', 'FACTORY', true, 'MONTH_END', 'HIGH', 'BRANCH_USER', 'BRANCH', 'BOTH', 'Only factory-side contractor record', true)
ON CONFLICT (return_code) DO UPDATE SET
  return_name = EXCLUDED.return_name,
  law_area = EXCLUDED.law_area,
  category = EXCLUDED.category,
  state_code = EXCLUDED.state_code,
  frequency = EXCLUDED.frequency,
  applies_to = EXCLUDED.applies_to,
  upload_required = EXCLUDED.upload_required,
  due_date_rule = EXCLUDED.due_date_rule,
  risk_level = EXCLUDED.risk_level,
  responsible_role = EXCLUDED.responsible_role,
  remarks = EXCLUDED.remarks,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
