-- Fix: Remove PF_ER_FROM_EMP from employee deductions
-- Employer PF should never be deducted from employee wages

-- Step 1: For all runs, recalculate NET_PAY by adding back PF_ER_FROM_EMP
-- that was wrongly deducted.
-- We update the NET_PAY component value for each run_employee where PF_ER_FROM_EMP > 0

-- First, update NET_PAY = NET_PAY + PF_ER_FROM_EMP for affected employees
UPDATE payroll_run_component_values net
SET amount = net.amount + pfe.amount
FROM payroll_run_component_values pfe
WHERE net.run_employee_id = pfe.run_employee_id
  AND net.run_id = pfe.run_id
  AND net.component_code = 'NET_PAY'
  AND pfe.component_code = 'PF_ER_FROM_EMP'
  AND pfe.amount > 0;

-- Also update the run_employees table net_pay column
UPDATE payroll_run_employees e
SET net_pay = e.net_pay + pfe.amount
FROM payroll_run_component_values pfe
WHERE e.id = pfe.run_employee_id
  AND pfe.run_id = e.run_id
  AND pfe.component_code = 'PF_ER_FROM_EMP'
  AND pfe.amount > 0;

-- Also update total_deductions on run_employees
UPDATE payroll_run_employees e
SET total_deductions = e.total_deductions - pfe.amount
FROM payroll_run_component_values pfe
WHERE e.id = pfe.run_employee_id
  AND pfe.run_id = e.run_id
  AND pfe.component_code = 'PF_ER_FROM_EMP'
  AND pfe.amount > 0;

-- Step 2: Zero out PF_ER_FROM_EMP
UPDATE payroll_run_component_values
SET amount = 0
WHERE component_code = 'PF_ER_FROM_EMP'
  AND amount > 0;
