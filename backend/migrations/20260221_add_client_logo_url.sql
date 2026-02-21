-- Migration: Add logo_url to clients table for company branding in ESS portal
-- Date: 2026-02-21

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500) DEFAULT NULL;

COMMENT ON COLUMN clients.logo_url IS 'URL/path to company logo for ESS portal branding';
