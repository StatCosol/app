-- =====================================================
-- Seed register templates for ALL remaining Acts
-- Code on Wages, Shops & Establishments, Maternity,
-- Bonus, CLRA, Equal Remuneration, Social Security
-- =====================================================

-- ── Code on Wages / Payment of Wages Act (new additions) ──
INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','ALL','DAMAGE_LOSS_REGISTER','Register of Damage / Loss','Payment of Wages Act - Sec 7(2)(c)','CODE_ON_WAGES','CENTRAL_COMBINED','EVENT_BASED','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','ALL','WAGE_SLIP_REGISTER','Wage Slip Register','Payment of Wages Act - Sec 6','CODE_ON_WAGES','CENTRAL_COMBINED','MONTHLY','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','ALL','ANNUAL_RETURN_WAGES','Annual Return (Form III / Form 28)','Minimum Wages Act / Payment of Wages Act','CODE_ON_WAGES','CENTRAL_COMBINED','ANNUAL','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','ALL','MINIMUM_WAGE_ABSTRACT','Minimum Wages Abstract (Notice)','Minimum Wages Act - Sec 12(1)','CODE_ON_WAGES','CENTRAL_COMBINED','EVENT_BASED','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

-- ── Shops & Establishments Act ──
INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','SHOP','SHOPS_LEAVE_REGISTER','Leave Register','Shops & Establishments Act','SHOPS_ESTABLISHMENTS','CENTRAL_COMBINED','ANNUAL','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','SHOP','SHOPS_WAGE_REGISTER','Wage Register','Shops & Establishments Act','SHOPS_ESTABLISHMENTS','CENTRAL_COMBINED','MONTHLY','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','SHOP','SHOPS_EMPLOYMENT_CARD','Employment Card / Service Record','Shops & Establishments Act','SHOPS_ESTABLISHMENTS','CENTRAL_COMBINED','EVENT_BASED','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','SHOP','SHOPS_HOLIDAY_REGISTER','Weekly / Compensatory Holiday Register','Shops & Establishments Act','SHOPS_ESTABLISHMENTS','CENTRAL_COMBINED','MONTHLY','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','SHOP','SHOPS_WORK_HOURS_REGISTER','Working Hours / Overtime Register','Shops & Establishments Act','SHOPS_ESTABLISHMENTS','CENTRAL_COMBINED','MONTHLY','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','SHOP','SHOPS_ANNUAL_RETURN','Annual Return (Shops Act)','Shops & Establishments Act','SHOPS_ESTABLISHMENTS','CENTRAL_COMBINED','ANNUAL','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','SHOP','SHOPS_NOTICE_DISPLAY','Display of Notices & Abstracts','Shops & Establishments Act','SHOPS_ESTABLISHMENTS','CENTRAL_COMBINED','EVENT_BASED','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

-- Update existing EMPLOYEE_REGISTER to have law_family
UPDATE register_templates SET law_family='SHOPS_ESTABLISHMENTS' WHERE register_type='EMPLOYEE_REGISTER' AND law_family IS NULL;

-- ── Social Security (PF / ESI / Gratuity) new additions ──
INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','ALL','PF_NOMINATION_REGISTER','PF Nomination Register (Form 2)','EPF Act - Sec 6','SOCIAL_SECURITY','CENTRAL_COMBINED','EVENT_BASED','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','ALL','ESI_ACCIDENT_REGISTER','ESI Accident / Sickness Register','ESI Act','SOCIAL_SECURITY','CENTRAL_COMBINED','EVENT_BASED','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','ALL','GRATUITY_NOMINATION_REGISTER','Gratuity Nomination Register (Form F)','Payment of Gratuity Act - Sec 6','SOCIAL_SECURITY','CENTRAL_COMBINED','EVENT_BASED','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

-- ── Professional Tax (new addition) ──
INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','ALL','PT_RETURN_REGISTER','PT Monthly / Annual Return','Professional Tax Act','STATE_TAX','CENTRAL_COMBINED','MONTHLY','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

-- ── Payment of Bonus Act ──
INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','ALL','BONUS_COMPUTATION_SHEET','Allocable Surplus Computation (Form B)','Payment of Bonus Act - Sec 11','BONUS_ACT','CENTRAL_COMBINED','ANNUAL','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','ALL','BONUS_SET_ON_OFF','Set-On / Set-Off Register (Form C)','Payment of Bonus Act - Sec 15','BONUS_ACT','CENTRAL_COMBINED','ANNUAL','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','ALL','BONUS_ANNUAL_RETURN','Annual Return (Form D)','Payment of Bonus Act - Sec 36','BONUS_ACT','CENTRAL_COMBINED','ANNUAL','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

-- Update existing BONUS_REGISTER law_family
UPDATE register_templates SET law_family='BONUS_ACT' WHERE register_type='BONUS_REGISTER' AND law_family IS NULL;

-- ── Contract Labour (Regulation & Abolition) Act ──
INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','ALL','CONTRACT_WORKMEN_REGISTER','Register of Contract Workmen (Form XIII)','CLRA - Sec 29','CLRA','CENTRAL_COMBINED','EVENT_BASED','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','ALL','CONTRACT_MUSTER_ROLL','Muster Roll (Contract Labour)','CLRA - Rule 78','CLRA','CENTRAL_COMBINED','MONTHLY','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','ALL','CONTRACT_WAGE_REGISTER','Wage Register (Contract Labour)','CLRA - Rule 78','CLRA','CENTRAL_COMBINED','MONTHLY','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','ALL','CONTRACT_DEDUCTION_REGISTER','Deduction Register (Contract Labour)','CLRA - Rule 78','CLRA','CENTRAL_COMBINED','MONTHLY','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','ALL','CONTRACT_OVERTIME_REGISTER','Overtime Register (Contract Labour)','CLRA - Rule 78','CLRA','CENTRAL_COMBINED','MONTHLY','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','ALL','CONTRACT_EMPLOYMENT_CARD','Employment Card (Form XIV)','CLRA - Rule 75','CLRA','CENTRAL_COMBINED','EVENT_BASED','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','ALL','CONTRACT_ANNUAL_RETURN','Annual Return (CLRA - Form XXV)','CLRA - Rule 82','CLRA','CENTRAL_COMBINED','ANNUAL','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

-- Update existing CONTRACTOR_REGISTER law_family
UPDATE register_templates SET law_family='CLRA' WHERE register_type='CONTRACTOR_REGISTER' AND law_family IS NULL;

-- ── Maternity Benefit Act ──
INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','ALL','MATERNITY_LEAVE_REGISTER','Maternity Leave Register','Maternity Benefit Act - Sec 5','MATERNITY_BENEFIT','CENTRAL_COMBINED','EVENT_BASED','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','ALL','MATERNITY_PAYMENT_REGISTER','Maternity Payment Register','Maternity Benefit Act - Sec 5(1)','MATERNITY_BENEFIT','CENTRAL_COMBINED','EVENT_BASED','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','ALL','MATERNITY_DISMISSAL_REGISTER','Dismissal / Discharge Register','Maternity Benefit Act - Sec 12','MATERNITY_BENEFIT','CENTRAL_COMBINED','EVENT_BASED','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','ALL','MATERNITY_ANNUAL_RETURN','Annual Return (Maternity - Form R)','Maternity Benefit Act - Sec 20','MATERNITY_BENEFIT','CENTRAL_COMBINED','ANNUAL','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

-- Update existing MATERNITY_REGISTER law_family
UPDATE register_templates SET law_family='MATERNITY_BENEFIT' WHERE register_type='MATERNITY_REGISTER' AND law_family IS NULL;

-- ── Equal Remuneration Act ──
INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions)
VALUES('ALL','ALL','EQUAL_REMUNERATION_RETURN','Annual Return (ER Act)','Equal Remuneration Act - Rule 6','EQUAL_REMUNERATION','CENTRAL_COMBINED','ANNUAL','{}'::jsonb,'[]'::jsonb)
ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING;

-- Update existing EQUAL_REMUNERATION_REGISTER law_family
UPDATE register_templates SET law_family='EQUAL_REMUNERATION' WHERE register_type='EQUAL_REMUNERATION_REGISTER' AND law_family IS NULL;

-- Update existing registers that may be missing law_family
UPDATE register_templates SET law_family='CODE_ON_WAGES' WHERE register_type IN('WAGE_REGISTER','MUSTER_ROLL','OVERTIME_REGISTER','LEAVE_REGISTER','DEDUCTION_REGISTER','FINE_REGISTER','ADVANCE_REGISTER') AND law_family IS NULL;
UPDATE register_templates SET law_family='SOCIAL_SECURITY' WHERE register_type IN('PF_REGISTER','ESI_REGISTER','GRATUITY_REGISTER','ECR','ESI') AND law_family IS NULL;
UPDATE register_templates SET law_family='STATE_TAX' WHERE register_type='PT_REGISTER' AND law_family IS NULL;
