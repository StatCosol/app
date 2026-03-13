CREATE TABLE IF NOT EXISTS admin_digest_runs (
  id BIGSERIAL PRIMARY KEY,
  digest_type VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  source VARCHAR(40) NOT NULL DEFAULT 'UNKNOWN',
  triggered_by UUID NULL,
  recipients_count INTEGER NOT NULL DEFAULT 0,
  summary JSONB NULL,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_digest_runs_created_at
  ON admin_digest_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_digest_runs_type
  ON admin_digest_runs (digest_type, created_at DESC);
