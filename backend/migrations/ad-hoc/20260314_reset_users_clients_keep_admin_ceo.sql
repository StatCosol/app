-- ============================================================================
-- RESET OPERATIONAL DATA
-- Keep only ADMIN + CEO users, delete all other users, and delete all clients.
-- Intended for fresh re-registration from the UI.
--
-- Usage example:
--   psql -h localhost -U postgres -d statco_dev -f migrations/ad-hoc/20260314_reset_users_clients_keep_admin_ceo.sql
-- ============================================================================

BEGIN;

-- 1) Build keep/drop sets -----------------------------------------------------
CREATE TEMP TABLE _keep_users AS
SELECT u.id
FROM users u
JOIN roles r ON r.id = u.role_id
WHERE UPPER(r.code) IN ('ADMIN', 'CEO');

DO $$
DECLARE
  keep_count int;
BEGIN
  SELECT COUNT(*) INTO keep_count FROM _keep_users;
  IF keep_count = 0 THEN
    RAISE EXCEPTION 'No ADMIN/CEO users found. Aborting reset to avoid lockout.';
  END IF;
END $$;

CREATE TEMP TABLE _drop_users AS
SELECT u.id
FROM users u
WHERE u.id NOT IN (SELECT id FROM _keep_users);

CREATE TEMP TABLE _drop_clients AS
SELECT c.id
FROM clients c;

-- 2) Break direct refs inside users table first -------------------------------
UPDATE users
SET owner_cco_id = NULL
WHERE owner_cco_id IN (SELECT id FROM _drop_users);

UPDATE users
SET client_id = NULL
WHERE client_id IN (SELECT id FROM _drop_clients);

-- 3) Remove or null all FK refs to users (excluding users table) -------------
DO $$
DECLARE
  ref_rec record;
  sql_stmt text;
BEGIN
  FOR ref_rec IN
    SELECT
      tc.table_schema,
      tc.table_name,
      kcu.column_name,
      col.is_nullable
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    JOIN information_schema.columns col
      ON col.table_schema = tc.table_schema
     AND col.table_name = tc.table_name
     AND col.column_name = kcu.column_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = 'public'
      AND ccu.table_name = 'users'
      AND ccu.column_name = 'id'
      AND NOT (tc.table_schema = 'public' AND tc.table_name = 'users')
  LOOP
    IF ref_rec.is_nullable = 'YES' THEN
      sql_stmt := format(
        'UPDATE %I.%I SET %I = NULL WHERE %I IN (SELECT id FROM _drop_users)',
        ref_rec.table_schema,
        ref_rec.table_name,
        ref_rec.column_name,
        ref_rec.column_name
      );
    ELSE
      sql_stmt := format(
        'DELETE FROM %I.%I WHERE %I IN (SELECT id FROM _drop_users)',
        ref_rec.table_schema,
        ref_rec.table_name,
        ref_rec.column_name,
        ref_rec.column_name
      );
    END IF;

    EXECUTE sql_stmt;
  END LOOP;
END $$;

-- 4) Remove or null all FK refs to clients (excluding clients table) ----------
DO $$
DECLARE
  ref_rec record;
  sql_stmt text;
BEGIN
  FOR ref_rec IN
    SELECT
      tc.table_schema,
      tc.table_name,
      kcu.column_name,
      col.is_nullable
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    JOIN information_schema.columns col
      ON col.table_schema = tc.table_schema
     AND col.table_name = tc.table_name
     AND col.column_name = kcu.column_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = 'public'
      AND ccu.table_name = 'clients'
      AND ccu.column_name = 'id'
      AND NOT (tc.table_schema = 'public' AND tc.table_name = 'clients')
  LOOP
    IF ref_rec.is_nullable = 'YES' THEN
      sql_stmt := format(
        'UPDATE %I.%I SET %I = NULL WHERE %I IN (SELECT id FROM _drop_clients)',
        ref_rec.table_schema,
        ref_rec.table_name,
        ref_rec.column_name,
        ref_rec.column_name
      );
    ELSE
      sql_stmt := format(
        'DELETE FROM %I.%I WHERE %I IN (SELECT id FROM _drop_clients)',
        ref_rec.table_schema,
        ref_rec.table_name,
        ref_rec.column_name,
        ref_rec.column_name
      );
    END IF;

    EXECUTE sql_stmt;
  END LOOP;
END $$;

-- 5) Delete target rows --------------------------------------------------------
DELETE FROM users
WHERE id IN (SELECT id FROM _drop_users);

DELETE FROM clients
WHERE id IN (SELECT id FROM _drop_clients);

COMMIT;

-- 6) Verification --------------------------------------------------------------
SELECT 'users_remaining' AS check_name, COUNT(*)::bigint AS value FROM users
UNION ALL
SELECT 'admin_ceo_remaining', COUNT(*)::bigint
FROM users u
JOIN roles r ON r.id = u.role_id
WHERE UPPER(r.code) IN ('ADMIN', 'CEO')
UNION ALL
SELECT 'non_admin_ceo_remaining', COUNT(*)::bigint
FROM users u
JOIN roles r ON r.id = u.role_id
WHERE UPPER(r.code) NOT IN ('ADMIN', 'CEO')
UNION ALL
SELECT 'clients_remaining', COUNT(*)::bigint FROM clients;
