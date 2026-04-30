-- News items enhancements: category, pinned, expiry, image, soft delete, updated_by
ALTER TABLE news_items
  ADD COLUMN IF NOT EXISTS category    VARCHAR(30)  NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN IF NOT EXISTS pinned      BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS expires_at  TIMESTAMPTZ  NULL,
  ADD COLUMN IF NOT EXISTS image_url   VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS updated_by  UUID         NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ  NULL;

CREATE INDEX IF NOT EXISTS idx_news_items_category   ON news_items (category);
CREATE INDEX IF NOT EXISTS idx_news_items_pinned      ON news_items (pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_items_expires_at  ON news_items (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_news_items_deleted_at  ON news_items (deleted_at) WHERE deleted_at IS NULL;
