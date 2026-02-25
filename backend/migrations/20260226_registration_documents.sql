-- Add document upload + renewal columns to branch_registrations
-- 2026-02-26

ALTER TABLE branch_registrations
  ADD COLUMN IF NOT EXISTS document_url        TEXT NULL,
  ADD COLUMN IF NOT EXISTS renewal_document_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS renewed_on          TIMESTAMPTZ NULL;
