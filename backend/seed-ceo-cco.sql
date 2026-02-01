-- Seed CEO and two CCO users (password: Statco@123)
-- Assumes roles:
--   2 = CEO
--   3 = CCO
-- Uses bcrypt/bcryptjs hash: $2a$10$1cP2qZ2rjU1QxZ3JZpG0IuK2jWn9L1GkZJ1Q0F6GQ4zZ7pK8nQv0a

INSERT INTO roles (id, code, name) VALUES
  (2, 'CEO', 'Chief Executive Officer'),
  (3, 'CCO', 'Chief Compliance Officer')
ON CONFLICT (id) DO NOTHING;

-- CEO
INSERT INTO users ("roleId", name, email, "passwordHash", "isActive", "clientId", "ownerCcoId", "createdAt")
VALUES (
  2,
  'Madan',
  'madan@statcosol.com',
  '$2a$10$1cP2qZ2rjU1QxZ3JZpG0IuK2jWn9L1GkZJ1Q0F6GQ4zZ7pK8nQv0a',
  true,
  NULL,
  NULL,
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  "passwordHash" = EXCLUDED."passwordHash",
  "isActive" = true,
  "deletedAt" = NULL;

-- CCO 1 - Compliance
INSERT INTO users ("roleId", name, email, "passwordHash", "isActive", "clientId", "ownerCcoId", "createdAt")
VALUES (
  3,
  'CCO - Compliance',
  'Compliance@statcosol.com',
  '$2a$10$1cP2qZ2rjU1QxZ3JZpG0IuK2jWn9L1GkZJ1Q0F6GQ4zZ7pK8nQv0a',
  true,
  NULL,
  NULL,
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  "passwordHash" = EXCLUDED."passwordHash",
  "isActive" = true,
  "deletedAt" = NULL;

-- CCO 2 - Payroll Audit
INSERT INTO users ("roleId", name, email, "passwordHash", "isActive", "clientId", "ownerCcoId", "createdAt")
VALUES (
  3,
  'CCO - Payroll Audit',
  'payroll_audit@statcosol.com',
  '$2a$10$1cP2qZ2rjU1QxZ3JZpG0IuK2jWn9L1GkZJ1Q0F6GQ4zZ7pK8nQv0a',
  true,
  NULL,
  NULL,
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  "passwordHash" = EXCLUDED."passwordHash",
  "isActive" = true,
  "deletedAt" = NULL;

SELECT 'Seeded CEO/CCOs (email + Statco@123) if they did not already exist.' AS message;
