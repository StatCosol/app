-- Fix ACTUAL_GROSS component type from EARNING to INFO for Logiq client
-- EARNING caused it to be double-counted in GROSS calculation
UPDATE payroll_components
SET component_type = 'INFO',
    is_taxable = false,
    updated_at = NOW()
WHERE code = 'ACTUAL_GROSS'
  AND client_id = (
    SELECT client_id FROM users WHERE email = 'ashok@logiqems.com' LIMIT 1
  );
