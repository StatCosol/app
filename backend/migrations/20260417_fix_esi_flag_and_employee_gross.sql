-- Fix K. Laxmamma (LMSHYD0014) monthly_gross: 12710 -> 12720
UPDATE employees SET monthly_gross = 12720
WHERE employee_code = 'LMSHYD0014' AND client_id = 'b0f71c41-5a0c-4dc5-9204-fa0bb1455f4d';

-- Fix Shanthi (LMSHYD0029) monthly_gross: 12720 -> 18000
UPDATE employees SET monthly_gross = 18000
WHERE employee_code = 'LMSHYD0029' AND client_id = 'b0f71c41-5a0c-4dc5-9204-fa0bb1455f4d';
