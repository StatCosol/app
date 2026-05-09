-- Add missing columns to compliance_evidence table

BEGIN;

-- Add file_type if missing
ALTER TABLE compliance_evidence
  ADD COLUMN IF NOT EXISTS file_type varchar(50) NULL;

-- Add file_size if missing
ALTER TABLE compliance_evidence
  ADD COLUMN IF NOT EXISTS file_size bigint NULL;

-- Add notes column (missing from original schema)
ALTER TABLE compliance_evidence
  ADD COLUMN IF NOT EXISTS notes text NULL;

COMMIT;
