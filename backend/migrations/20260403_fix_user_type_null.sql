-- Fix user_type NULL values caused by entity insert:false/update:false bug
-- Back-fill MASTER for client users who own branches or are the only CLIENT user for a client
-- Back-fill BRANCH for client users linked in user_branches

BEGIN;

-- 1. Mark users linked via user_branches as BRANCH (if user_type is NULL and role is CLIENT)
UPDATE users u
SET    user_type = 'BRANCH'
WHERE  u.user_type IS NULL
  AND  u.deleted_at IS NULL
  AND  u.role_id = (SELECT id FROM roles WHERE code = 'CLIENT' LIMIT 1)
  AND  EXISTS (SELECT 1 FROM user_branches ub WHERE ub.user_id = u.id);

-- 2. Mark remaining CLIENT users (not in user_branches) as MASTER
UPDATE users u
SET    user_type = 'MASTER'
WHERE  u.user_type IS NULL
  AND  u.deleted_at IS NULL
  AND  u.role_id = (SELECT id FROM roles WHERE code = 'CLIENT' LIMIT 1)
  AND  NOT EXISTS (SELECT 1 FROM user_branches ub WHERE ub.user_id = u.id);

COMMIT;
