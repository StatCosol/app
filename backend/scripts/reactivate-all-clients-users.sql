-- Reactivate all clients and users in the database
-- This script will set all clients and users to active and not deleted

-- Reactivate all clients
table clients;
UPDATE clients
SET status = 'ACTIVE', is_active = true, is_deleted = false
WHERE is_active = false OR is_deleted = true OR status != 'ACTIVE';

-- Reactivate all users
UPDATE users
SET is_active = true
WHERE is_active = false;

-- Optionally, you can add more fields if your schema requires.
-- Always backup your database before running mass updates!