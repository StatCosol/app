-- Rename component code ARREARS_BONUS → ARREAR_ATT_BONUS everywhere
BEGIN;

-- 1) payroll_components (master definition)
UPDATE payroll_components
   SET code = 'ARREAR_ATT_BONUS',
       name = 'Arrear Attendance Bonus'
 WHERE code = 'ARREARS_BONUS';

-- 2) payroll_run_component_values (run-level stored values)
UPDATE payroll_run_component_values
   SET component_code = 'ARREAR_ATT_BONUS'
 WHERE component_code = 'ARREARS_BONUS';

-- 3) payroll_component_rules (if any rules reference the old code)
UPDATE payroll_component_rules
   SET component_code = 'ARREAR_ATT_BONUS'
 WHERE component_code = 'ARREARS_BONUS';

COMMIT;
