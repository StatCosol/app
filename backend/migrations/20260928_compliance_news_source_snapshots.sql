-- 2026-09-28 - source snapshots for automated compliance news monitoring.
-- The monitor records a hash per official source and publishes news when
-- a previously-seen source changes with labour/FSSAI/minimum-wage keywords.

CREATE TABLE IF NOT EXISTS compliance_news_source_snapshots (
  source_code      varchar(80) PRIMARY KEY,
  source_label     varchar(200) NOT NULL,
  source_url       text NOT NULL,
  last_hash        varchar(64) NOT NULL,
  matched_keywords boolean NOT NULL DEFAULT false,
  last_checked_at  timestamptz NOT NULL DEFAULT NOW(),
  updated_at       timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_news_source_checked
  ON compliance_news_source_snapshots (last_checked_at DESC);
