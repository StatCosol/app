-- =====================================================================
-- Statutory Returns Reference Seed — Complete India Labour Law Returns
-- Date: 2026-04-27
-- Adds: Employment Exchange, POSH, Maternity, Equal Remuneration,
--       Gratuity (Form L/M), CLRA Form XXV, ESI Form 5 (Half-Yearly),
--       State Combined Annual Returns (TS/AP/KA/MH/TN),
--       Event-Based Compliances (ID Act, ECA, Factories, CLRA)
-- =====================================================================

-- ── 1. Employment Exchange ────────────────────────────────────────────
INSERT INTO compliance_return_master
  (return_code, return_name, law_area, frequency, category, state_code,
   applies_to, upload_required, due_day, due_date_rule, risk_level,
   responsible_role, scope_default, applicable_for, remarks, is_active)
VALUES
  ('EMP_EXCHANGE_ER1',
   'Employment Exchange Quarterly Vacancy Return (ER-I)',
   'Employment Exchanges (CNV) Act, 1959',
   'QUARTERLY', 'STATUTORY', 'ALL',
   'BOTH', true, 30, 'END_OF_QUARTER',
   'LOW', 'CLIENT_MASTER', 'CLIENT', 'BOTH',
   'Quarterly vacancy notification; mandatory for establishments with 25+ employees', true),

  ('EMP_EXCHANGE_ER2',
   'Employment Exchange Biennial Staff Return (ER-II)',
   'Employment Exchanges (CNV) Act, 1959',
   'BI_YEARLY', 'STATUTORY', 'ALL',
   'BOTH', true, 30, 'END_OF_BIENNIAL_YEAR',
   'LOW', 'CLIENT_MASTER', 'CLIENT', 'BOTH',
   'Staff return filed every two years; reports current workforce details', true)
ON CONFLICT (return_code) DO NOTHING;

-- ── 2. POSH Annual Report ─────────────────────────────────────────────
INSERT INTO compliance_return_master
  (return_code, return_name, law_area, frequency, category, state_code,
   applies_to, upload_required, due_day, due_date_rule, risk_level,
   responsible_role, scope_default, applicable_for, remarks, is_active)
VALUES
  ('POSH_ANNUAL_REPORT',
   'POSH Annual Report to District Officer',
   'Sexual Harassment of Women at Workplace Act, 2013',
   'YEARLY', 'STATUTORY', 'ALL',
   'BOTH', true, 31, 'BEFORE_31_JAN',
   'HIGH', 'CLIENT_MASTER', 'CLIENT', 'BOTH',
   'Annual report on number of complaints received, disposed; submitted by IC/LCC to District Officer', true)
ON CONFLICT (return_code) DO NOTHING;

-- ── 3. Maternity Benefit Act Annual Return ────────────────────────────
INSERT INTO compliance_return_master
  (return_code, return_name, law_area, frequency, category, state_code,
   applies_to, upload_required, due_day, due_date_rule, risk_level,
   responsible_role, scope_default, applicable_for, remarks, is_active)
VALUES
  ('MATERNITY_ANNUAL',
   'Maternity Benefit Act Annual Return',
   'Maternity Benefit Act, 1961',
   'YEARLY', 'STATUTORY', 'ALL',
   'BOTH', true, 30, 'END_OF_YEAR',
   'MEDIUM', 'CLIENT_MASTER', 'CLIENT', 'BOTH',
   'Annual return reporting maternity benefit payments and number of beneficiaries', true)
ON CONFLICT (return_code) DO NOTHING;

-- ── 4. Equal Remuneration Act Annual Return ───────────────────────────
INSERT INTO compliance_return_master
  (return_code, return_name, law_area, frequency, category, state_code,
   applies_to, upload_required, due_day, due_date_rule, risk_level,
   responsible_role, scope_default, applicable_for, remarks, is_active)
VALUES
  ('EQUAL_REMUN_ANNUAL',
   'Equal Remuneration Act Annual Return (Form D)',
   'Equal Remuneration Act, 1976',
   'YEARLY', 'STATUTORY', 'ALL',
   'BOTH', true, 30, 'END_OF_YEAR',
   'MEDIUM', 'CLIENT_MASTER', 'CLIENT', 'BOTH',
   'Annual return on male/female employee strength and wages; Form D under Equal Remuneration Rules', true)
ON CONFLICT (return_code) DO NOTHING;

-- ── 5. Gratuity Annual Return (Form L / M) ────────────────────────────
INSERT INTO compliance_return_master
  (return_code, return_name, law_area, frequency, category, state_code,
   applies_to, upload_required, due_day, due_date_rule, risk_level,
   responsible_role, scope_default, applicable_for, remarks, is_active)
VALUES
  ('GRATUITY_FORM_LM',
   'Gratuity Annual Return (Form L / Form M)',
   'Payment of Gratuity Act, 1972',
   'YEARLY', 'STATUTORY', 'ALL',
   'BOTH', true, 30, 'BEFORE_30_APR',
   'MEDIUM', 'CLIENT_MASTER', 'CLIENT', 'BOTH',
   'Form L: details of employees entitled to gratuity; Form M: abstract of gratuity liability. Filed annually with controlling authority', true)
ON CONFLICT (return_code) DO NOTHING;

-- ── 6. CLRA Form XXV — Annual Return (Principal Employer) ─────────────
INSERT INTO compliance_return_master
  (return_code, return_name, law_area, frequency, category, state_code,
   applies_to, upload_required, due_day, due_date_rule, risk_level,
   responsible_role, scope_default, applicable_for, remarks, is_active)
VALUES
  ('CLRA_FORM_XXV',
   'CLRA Annual Return — Principal Employer (Form XXV)',
   'Contract Labour (R&A) Act, 1970',
   'YEARLY', 'STATUTORY', 'ALL',
   'BOTH', true, 15, 'BEFORE_15_FEB',
   'HIGH', 'CRM', 'CLIENT', 'BOTH',
   'Annual return by principal employer on number of contractors, contract labour engaged, wages paid. Distinct from CLRA_ANNUAL_RETURN (contractor Form XXIV)', true)
ON CONFLICT (return_code) DO NOTHING;

-- ── 7. ESI Form 5 — Half-Yearly Return of Contribution ───────────────
INSERT INTO compliance_return_master
  (return_code, return_name, law_area, frequency, category, state_code,
   applies_to, upload_required, due_day, due_date_rule, risk_level,
   responsible_role, scope_default, applicable_for, remarks, is_active)
VALUES
  ('ESI_FORM5_HY',
   'ESI Return of Contribution (Form 5) — Half-Yearly',
   'ESI Act, 1948',
   'HALF_YEARLY', 'PF_ESI', 'ALL',
   'BOTH', true, 15, 'WITHIN_42_DAYS_END_OF_CONTRIBUTION_PERIOD',
   'HIGH', 'CLIENT_MASTER', 'BRANCH', 'BOTH',
   'Half-yearly return of contributions; April–Sep due by 12 Nov, Oct–Mar due by 12 May. Submitted to ESIC regional office', true)
ON CONFLICT (return_code) DO NOTHING;

-- ── 8. TDS Form 24Q Quarterly (ensure return type present) ────────────
-- Already seeded as TDS_QTR_24Q / TDS_QTR_26Q; skip if exists
INSERT INTO compliance_return_master
  (return_code, return_name, law_area, frequency, category, state_code,
   applies_to, upload_required, due_day, due_date_rule, risk_level,
   responsible_role, scope_default, applicable_for, remarks, is_active)
VALUES
  ('TDS_QTR_24Q_SALARY',
   'TDS Quarterly Return on Salary (Form 24Q)',
   'Income Tax Act, 1961',
   'QUARTERLY', 'TAX', 'ALL',
   'BOTH', true, 31, 'END_OF_QUARTER_PLUS_1_MONTH',
   'HIGH', 'CLIENT_MASTER', 'CLIENT', 'BOTH',
   'Q1 Jul 31, Q2 Oct 31, Q3 Jan 31, Q4 May 31. Filed by deductor for salary TDS', true)
ON CONFLICT (return_code) DO NOTHING;

-- ── 9. State Combined / Integrated Annual Returns ─────────────────────
INSERT INTO compliance_return_master
  (return_code, return_name, law_area, frequency, category, state_code,
   applies_to, upload_required, due_day, due_date_rule, risk_level,
   responsible_role, scope_default, applicable_for, remarks, is_active)
VALUES
  ('TS_INTEGRATED_ANNUAL',
   'Telangana Integrated Annual Return',
   'Multiple Labour Laws (TS)',
   'YEARLY', 'COMBINED_RETURN', 'TS',
   'BOTH', true, 31, 'BEFORE_31_JAN',
   'HIGH', 'CRM', 'CLIENT', 'BOTH',
   'Single combined annual return covering: Minimum Wages, Payment of Wages, Bonus, Maternity Benefit, Equal Remuneration. Does NOT cover PF, ESI, CLRA, Factories Act', true),

  ('AP_COMBINED_ANNUAL',
   'Andhra Pradesh Combined Annual Return',
   'Multiple Labour Laws (AP)',
   'YEARLY', 'COMBINED_RETURN', 'AP',
   'BOTH', true, 31, 'BEFORE_31_JAN',
   'HIGH', 'CRM', 'CLIENT', 'BOTH',
   'Combined annual return covering MW, Payment of Wages, Bonus, Maternity, Equal Remuneration. Format differs from TS but scope is similar', true),

  ('KA_UNIFIED_ANNUAL',
   'Karnataka Unified Annual Return',
   'Multiple Labour Laws (KA)',
   'YEARLY', 'COMBINED_RETURN', 'KA',
   'BOTH', true, 31, 'BEFORE_31_JAN',
   'HIGH', 'CRM', 'CLIENT', 'BOTH',
   'Karnataka state combined annual return under the Simplified Compliance Act', true),

  ('MH_COMBINED_ANNUAL',
   'Maharashtra Combined Annual Return',
   'Multiple Labour Laws (MH)',
   'YEARLY', 'COMBINED_RETURN', 'MH',
   'BOTH', true, 31, 'BEFORE_31_JAN',
   'HIGH', 'CRM', 'CLIENT', 'BOTH',
   'Maharashtra state combined annual return under the Labour Laws (Exemption) Act', true),

  ('TN_CONSOLIDATED_ANNUAL',
   'Tamil Nadu Consolidated Annual Return',
   'Multiple Labour Laws (TN)',
   'YEARLY', 'COMBINED_RETURN', 'TN',
   'BOTH', true, 31, 'BEFORE_31_JAN',
   'HIGH', 'CRM', 'CLIENT', 'BOTH',
   'Tamil Nadu state consolidated annual return covering applicable labour laws', true)
ON CONFLICT (return_code) DO NOTHING;

-- ── 10. Event-Based Compliances ───────────────────────────────────────
-- These do NOT appear in periodic calendars; filings are created only when the event occurs.
INSERT INTO compliance_return_master
  (return_code, return_name, law_area, frequency, category, state_code,
   applies_to, upload_required, due_day, due_date_rule, risk_level,
   responsible_role, scope_default, applicable_for, remarks, is_active)
VALUES
  ('EVT_ID_RETRENCHMENT',
   'Retrenchment / Establishment Closure Notice (Form P / Q)',
   'Industrial Disputes Act, 1947',
   'EVENT_BASED', 'EVENT_BASED', 'ALL',
   'BOTH', true, null, 'BEFORE_EVENT',
   'HIGH', 'CRM', 'CLIENT', 'BOTH',
   'Notice to government authority before retrenchment (Form P) or closure (Form Q). Applicable for 100+ workers. Filing triggered on HR event', true),

  ('EVT_ECA_ACCIDENT',
   'Accident Report — Employees Compensation Act (Form EE)',
   'Employees Compensation Act, 1923',
   'EVENT_BASED', 'EVENT_BASED', 'ALL',
   'BOTH', true, null, 'WITHIN_7_DAYS_OF_ACCIDENT',
   'HIGH', 'BRANCH_USER', 'BRANCH', 'BOTH',
   'Report of accident causing personal injury or death to be submitted to Commissioner. Triggered on accident event', true),

  ('EVT_FACTORY_ACCIDENT',
   'Factory Accident / Dangerous Occurrence Report (Form 18)',
   'Factories Act, 1948',
   'EVENT_BASED', 'EVENT_BASED', 'ALL',
   'FACTORY', true, null, 'WITHIN_12_HOURS_OF_ACCIDENT',
   'HIGH', 'BRANCH_USER', 'BRANCH', 'FACTORY',
   'Immediate notice to Inspector of Factories within 12 hours (fatal) or 4 hours (dangerous occurrence). Triggered on accident event', true),

  ('EVT_CLRA_CONTRACT_START',
   'CLRA Contract Work Commencement Notice (Form VI-B)',
   'Contract Labour (R&A) Act, 1970',
   'EVENT_BASED', 'EVENT_BASED', 'ALL',
   'BOTH', true, null, 'BEFORE_CONTRACT_START',
   'MEDIUM', 'CRM', 'CLIENT', 'BOTH',
   'Notice to licensing officer on commencement of contract work by contractor. Also used for cessation of contract work. Triggered when new contractor engagement begins', true)
ON CONFLICT (return_code) DO NOTHING;

-- ── 11. Ensure scope_default is CLIENT for combined/event returns ──────
UPDATE compliance_return_master
SET scope_default = 'CLIENT', updated_at = NOW()
WHERE return_code IN (
  'EMP_EXCHANGE_ER1', 'EMP_EXCHANGE_ER2',
  'POSH_ANNUAL_REPORT', 'MATERNITY_ANNUAL', 'EQUAL_REMUN_ANNUAL',
  'GRATUITY_FORM_LM', 'CLRA_FORM_XXV',
  'TS_INTEGRATED_ANNUAL', 'AP_COMBINED_ANNUAL', 'KA_UNIFIED_ANNUAL',
  'MH_COMBINED_ANNUAL', 'TN_CONSOLIDATED_ANNUAL',
  'EVT_ID_RETRENCHMENT', 'EVT_CLRA_CONTRACT_START'
)
AND scope_default != 'CLIENT';
