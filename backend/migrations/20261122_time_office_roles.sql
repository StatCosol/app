INSERT INTO roles (code, name, is_system) VALUES
 ('TIME_OFFICE_EXECUTIVE', 'Time Office Executive', true),
 ('TIME_OFFICE_MANAGER', 'Time Office Manager', true)
ON CONFLICT (code) DO NOTHING;
