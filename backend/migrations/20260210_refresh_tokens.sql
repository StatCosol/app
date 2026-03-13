-- Migration: Create refresh_tokens table for server-side refresh token storage
-- Enables token rotation, reuse detection, and logout/revocation

BEGIN;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jti         VARCHAR(64)  NOT NULL,
  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family      UUID         NOT NULL,
  expires_at  TIMESTAMPTZ  NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_jti    ON refresh_tokens(jti);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_userid        ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family        ON refresh_tokens(family);

-- Clean-up job hint: DELETE FROM refresh_tokens WHERE expires_at < now() - interval '7 days';

COMMIT;
