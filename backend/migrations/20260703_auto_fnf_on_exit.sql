-- Auto-create FnF records for employees who already exited but have no FnF record.
-- Going forward, deactivate() in employees.service.ts creates the record automatically.
INSERT INTO payroll_fnf (client_id, employee_id, separation_date, last_working_day, reason, status, checklist)
SELECT
  e.client_id,
  e.id,
  e.date_of_exit,
  e.date_of_exit,
  LEFT(COALESCE(NULLIF(e.exit_reason, ''), 'RESIGNATION'), 500),
  'INITIATED',
  '[]'::jsonb
FROM employees e
WHERE e.is_active = FALSE
  AND e.date_of_exit IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM payroll_fnf f WHERE f.employee_id = e.id
  );
