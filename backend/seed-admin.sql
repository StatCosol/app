-- Seed admin user
-- Password: Admin@123 (bcrypt hash)

-- First ensure roles table exists

INSERT INTO roles (id, code, name) VALUES 
  (1, 'ADMIN', 'Administrator')
ON CONFLICT (id) DO NOTHING;

-- Insert admin user (password: Admin@123)

-- Password: Admin@123 (bcrypt hash)


INSERT INTO users (role_id, name, email, password_hash, is_active, client_id, created_at)
VALUES (
  1, 
  'Admin User', 
  'it_admin@statcosol.com', 
  '$2b$10$QTR1Q6byPXC7Y3ijkVA9e.omRe4jv5Dr1Rm3kWwZ006kubHcVPmBq',  -- Admin@123
  true, 
  NULL,
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = '$2b$10$QTR1Q6byPXC7Y3ijkVA9e.omRe4jv5Dr1Rm3kWwZ006kubHcVPmBq',
  is_active = true,
  deleted_at = NULL;

SELECT 'Admin user created/updated: it_admin@statcosol.com / Admin@123' AS message;
