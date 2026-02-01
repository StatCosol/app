-- Link existing client users to Vedha Entech India (id=2)
UPDATE users SET "clientId" = 2 WHERE id IN (9, 10);

-- Verify the update
SELECT id, name, email, "roleId", "clientId" FROM users WHERE id IN (9, 10);
