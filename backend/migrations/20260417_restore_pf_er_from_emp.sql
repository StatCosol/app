-- Restore PF_ER_FROM_EMP deductions for employees with ACTUAL_GROSS > 25000
-- Reverses migration 20260417_fix_pf_er_from_emp.sql

-- Step 1: Restore PF_ER_FROM_EMP = PF_ER for employees whose ACTUAL_GROSS > 25000
UPDATE payroll_run_component_values pfe
SET amount = pfer.amount
FROM payroll_run_component_values pfer
WHERE pfe.run_employee_id = pfer.run_employee_id
  AND pfe.run_id = pfer.run_id
  AND pfe.component_code = 'PF_ER_FROM_EMP'
  AND pfer.component_code = 'PF_ER'
  AND pfe.amount = 0
  AND pfer.amount > 0
  AND EXISTS (
    SELECT 1 FROM payroll_run_component_values ag
    WHERE ag.run_employee_id = pfe.run_employee_id
      AND ag.run_id = pfe.run_id
      AND ag.component_code = 'ACTUAL_GROSS'
      AND ag.amount > 25000
  );

-- Step 2: Subtract PF_ER_FROM_EMP from NET_PAY component values
UPDATE payroll_run_component_values net
SET amount = net.amount - pfe.amount
FROM payroll_run_component_values pfe
WHERE net.run_employee_id = pfe.run_employee_id
  AND net.run_id = pfe.run_id
  AND net.component_code = 'NET_PAY'
  AND pfe.component_code = 'PF_ER_FROM_EMP'
  AND pfe.amount > 0;

-- Step 3: Update run_employees.net_pay
UPDATE payroll_run_employees e
SET net_pay = e.net_pay - pfe.amount
FROM payroll_run_component_values pfe
WHERE e.id = pfe.run_employee_id
  AND pfe.run_id = e.run_id
  AND pfe.component_code = 'PF_ER_FROM_EMP'
  AND pfe.amount > 0;

-- Step 4: Update run_employees.total_deductions
UPDATE payroll_run_employees e
SET total_deductions = e.total_deductions + pfe.amount
FROM payroll_run_component_values pfe
WHERE e.id = pfe.run_employee_id
  AND pfe.run_id = e.run_id
  AND pfe.component_code = 'PF_ER_FROM_EMP'
  AND pfe.amount > 0;
