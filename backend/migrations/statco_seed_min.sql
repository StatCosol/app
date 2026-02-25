-- Minimal seeds that are safe with the current backend boot logic.
-- NOTE: Admin user seeding is handled by UsersService.seedAdminIfMissing() on app startup.

INSERT INTO roles (code, name, is_system)
VALUES
  ('ADMIN','Admin', true),
  ('CEO','CEO', true),
  ('CCO','CCO', true),
  ('CRM','CRM', true),
  ('AUDITOR','Auditor', true),
  ('CLIENT','Client User', true),
  ('CONTRACTOR','Contractor', true)
ON CONFLICT (code) DO NOTHING;

-- NOTE: Sample clients removed. Add real clients via the Admin UI or dedicated migration.
-- Previously inserted: VEIPL, KHS, LCS, KPS, SLVMS (removed to avoid mock data in production).
