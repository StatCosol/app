-- Fix branch codes: replace auto-generated random codes with meaningful ones
-- Hyderabad branch → HYD-001
UPDATE client_branches
SET branch_code = 'HYD-001'
WHERE id = '94ad1c42-ea05-460e-b494-0a7e634de127';

-- Also update the employee_sequence table to use the new branch short code
UPDATE employee_sequence
SET branch_code = 'HYD'
WHERE branch_code = 'BRM'
  AND client_id = 'b0f71c41-5a0c-4dc5-9204-fa0bb1455f4d';
