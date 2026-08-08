-- Link CLRA contractor master records to portal contractor users
ALTER TABLE clra_contractors
  ADD COLUMN IF NOT EXISTS contractor_user_id UUID;

CREATE INDEX IF NOT EXISTS idx_clra_contractors_user
  ON clra_contractors(contractor_user_id)
  WHERE contractor_user_id IS NOT NULL;
