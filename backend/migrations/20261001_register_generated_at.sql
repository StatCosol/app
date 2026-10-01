-- Preserve record creation history while recording when replacement evidence is written.
-- Legacy files retain created_at as their effective generation time in the API.
ALTER TABLE registers_records
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ;
