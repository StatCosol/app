-- Add individual PF/ESI/PT/Bonus columns directly to payroll_run_employees
-- so that Paydek upload saves them in the main row for easy querying.

ALTER TABLE payroll_run_employees
  ADD COLUMN IF NOT EXISTS pf_employee  numeric(14,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS esi_employee numeric(14,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pt           numeric(14,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pf_employer  numeric(14,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS esi_employer numeric(14,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bonus        numeric(14,2) DEFAULT NULL;

-- Backfill from payroll_run_component_values for any runs that already have component data
UPDATE payroll_run_employees re
SET
  pf_employee  = (SELECT SUM(cv.amount) FROM payroll_run_component_values cv
                   WHERE cv.run_employee_id = re.id
                     AND regexp_replace(upper(cv.component_code),'[^A-Z0-9]','','g')
                         IN ('PF','PFEMP','PFEMPLOYEE','PFEE','EPFEMPLOYEE')),
  esi_employee = (SELECT SUM(cv.amount) FROM payroll_run_component_values cv
                   WHERE cv.run_employee_id = re.id
                     AND regexp_replace(upper(cv.component_code),'[^A-Z0-9]','','g')
                         IN ('ESI','ESIEMP','ESIEMPLOYEE','ESIEE')),
  pt           = (SELECT SUM(cv.amount) FROM payroll_run_component_values cv
                   WHERE cv.run_employee_id = re.id
                     AND regexp_replace(upper(cv.component_code),'[^A-Z0-9]','','g')
                         IN ('PT','PROFESSIONALTAX')),
  pf_employer  = (SELECT SUM(cv.amount) FROM payroll_run_component_values cv
                   WHERE cv.run_employee_id = re.id
                     AND regexp_replace(upper(cv.component_code),'[^A-Z0-9]','','g')
                         IN ('EMPLOYERPF','PFER','PFEMPLOYER','EPFEMPLOYER')),
  esi_employer = (SELECT SUM(cv.amount) FROM payroll_run_component_values cv
                   WHERE cv.run_employee_id = re.id
                     AND regexp_replace(upper(cv.component_code),'[^A-Z0-9]','','g')
                         IN ('EMPLOYERESI','ESIER','ESIEMPLOYER')),
  bonus        = (SELECT SUM(cv.amount) FROM payroll_run_component_values cv
                   WHERE cv.run_employee_id = re.id
                     AND regexp_replace(upper(cv.component_code),'[^A-Z0-9]','','g')
                         IN ('BONUS','STATUTORYBONUS','EMPLOYERBONUS','BONUSPROVISION'))
WHERE EXISTS (
  SELECT 1 FROM payroll_run_component_values cv2 WHERE cv2.run_employee_id = re.id
);
