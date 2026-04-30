-- Migration: Create news_items table for Latest News feature
-- Admin can post news, displayed as a scrolling ticker on Contractor/Client/Branch portals

CREATE TABLE IF NOT EXISTS news_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        VARCHAR(255) NOT NULL,
  body         TEXT NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_by   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_news_items_is_active ON news_items (is_active);
CREATE INDEX idx_news_items_created_at ON news_items (created_at DESC);
