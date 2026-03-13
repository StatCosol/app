-- Add deleted_by column and change file_size to bigint
-- 2026-02-27

ALTER TABLE crm_unit_documents ADD COLUMN IF NOT EXISTS deleted_by uuid;
ALTER TABLE crm_unit_documents ALTER COLUMN file_size TYPE bigint;
