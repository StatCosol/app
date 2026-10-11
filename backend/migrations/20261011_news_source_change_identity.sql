-- Identify automated alerts by source revision, preserving manual news items.
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS source_code varchar(80);
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS source_hash varchar(64);
CREATE UNIQUE INDEX IF NOT EXISTS uq_news_items_source_revision
  ON news_items (source_code, source_hash)
  WHERE source_code IS NOT NULL AND source_hash IS NOT NULL;
