-- Migration: user_type for master/branch client users
-- Date: 2026-02-10
-- Purpose: Add user_type column to users table (MASTER/BRANCH) for clarity.
--          Enforce uniqueness on user_branches. Back-fill existing CLIENT users.

BEGIN;

-- 1) Add user_type column (nullable, to be back-filled)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS user_type VARCHAR(10) DEFAULT NULL;

-- 2) Back-fill: CLIENT users with branch mappings → BRANCH, without → MASTER
UPDATE users u
  SET user_type = 'BRANCH'
  WHERE u.role_id = (SELECT id FROM roles WHERE code = 'CLIENT' LIMIT 1)
    AND EXISTS (SELECT 1 FROM user_branches ub WHERE ub.user_id = u.id)
    AND u.user_type IS NULL;

UPDATE users u
  SET user_type = 'MASTER'
  WHERE u.role_id = (SELECT id FROM roles WHERE code = 'CLIENT' LIMIT 1)
    AND NOT EXISTS (SELECT 1 FROM user_branches ub WHERE ub.user_id = u.id)
    AND u.user_type IS NULL;

-- 3) Ensure uniqueness on user_branches (user_id, branch_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_branches_user_branch
  ON user_branches(user_id, branch_id);

-- 4) Index on user_type for queries
CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type);

COMMIT;
