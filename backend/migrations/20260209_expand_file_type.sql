-- Expand file_type column to accommodate longer MIME types
-- (e.g., 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' is 70 chars)

BEGIN;

ALTER TABLE compliance_evidence
  ALTER COLUMN file_type TYPE varchar(150);

COMMIT;
