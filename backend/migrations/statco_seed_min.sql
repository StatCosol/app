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

-- Optional sample clients (can be removed anytime)
INSERT INTO clients (client_code, client_name, status, is_active)
VALUES
  ('VEIPL','Vedha Entech India Pvt Ltd','ACTIVE',true),
  ('KHS','Konark Hospitality Services','ACTIVE',true),
  ('LCS','Lakshmi Corporate Services','ACTIVE',true),
  ('KPS','Kamakshi Professional Services','ACTIVE',true),
  ('SLVMS','SLV Management Services','ACTIVE',true)
ON CONFLICT (client_code) DO NOTHING;
