-- Null means an existing page-hash baseline needs its first notification scan.
ALTER TABLE compliance_news_source_snapshots
  ADD COLUMN IF NOT EXISTS notification_hashes jsonb;
