-- Add upload lock window columns to audits table
ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS upload_lock_from DATE NULL,
  ADD COLUMN IF NOT EXISTS upload_lock_until DATE NULL;
