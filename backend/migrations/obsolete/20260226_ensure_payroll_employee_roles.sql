-- ============================================================
-- Ensure PAYROLL + EMPLOYEE roles exist in the roles table.
-- These are required for:
--   PAYROLL  → Paydek payroll module access
--   EMPLOYEE → ESS (Employee Self-Service) portal access
-- ============================================================

INSERT INTO roles (id, code, name, description)
VALUES (
  gen_random_uuid(),
  'PAYROLL',
  'Payroll Manager',
  'Processes payroll, generates PF/ESI returns, manages payslips'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO roles (id, code, name, description)
VALUES (
  gen_random_uuid(),
  'EMPLOYEE',
  'Employee Self-Service',
  'View payslips, apply leave, manage nominations'
)
ON CONFLICT (code) DO NOTHING;

-- Also ensure PF_TEAM role exists for PF ECR / ESI workflows
INSERT INTO roles (id, code, name, description)
VALUES (
  gen_random_uuid(),
  'PF_TEAM',
  'PF & ESI Team',
  'Manages PF ECR generation, ESI returns, and statutory submissions'
)
ON CONFLICT (code) DO NOTHING;
