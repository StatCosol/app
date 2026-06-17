-- Allow audit rows for failed login attempts where no matching user exists.
-- Older schemas used a NOT NULL FK, which forced code to write a fake UUID and
-- caused user_login_logs_user_id_fkey violations in the logs.

ALTER TABLE user_login_logs
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE user_login_logs
  DROP CONSTRAINT IF EXISTS user_login_logs_user_id_fkey;

ALTER TABLE user_login_logs
  ADD CONSTRAINT user_login_logs_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES users(id)
  ON DELETE SET NULL;

