-- Migration: User login logs table
-- Date: 2026-04-12
-- Purpose: Track every login event for audit, analytics and security

CREATE TABLE IF NOT EXISTS user_login_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email         varchar(180) NOT NULL,
  role_code     varchar(50)  NOT NULL,
  client_id     uuid,
  ip_address    varchar(45),
  user_agent    text,
  status        varchar(15)  NOT NULL DEFAULT 'SUCCESS',   -- SUCCESS | FAILED
  failure_reason varchar(80),                               -- BAD_PASSWORD | INACTIVE | DELETED | NOT_FOUND
  logged_in_at  timestamptz  NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_ull_user_id      ON user_login_logs (user_id, logged_in_at DESC);
CREATE INDEX idx_ull_email        ON user_login_logs (email, logged_in_at DESC);
CREATE INDEX idx_ull_logged_in_at ON user_login_logs (logged_in_at DESC);
CREATE INDEX idx_ull_status       ON user_login_logs (status) WHERE status = 'FAILED';

-- Also ensure the users table unique constraints exist properly
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users (email) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_user_code ON users (user_code) WHERE deleted_at IS NULL;
