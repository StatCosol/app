-- Add human-readable audit_code column to audits table
ALTER TABLE audits ADD COLUMN IF NOT EXISTS audit_code varchar(20) UNIQUE;

-- Backfill existing audits with a code based on their period_year and creation order
WITH numbered AS (
  SELECT id, period_year,
         ROW_NUMBER() OVER (PARTITION BY period_year ORDER BY created_at) AS rn
  FROM audits
  WHERE audit_code IS NULL
)
UPDATE audits a
SET audit_code = 'AUD-' || n.period_year || '-' || LPAD(n.rn::text, 3, '0')
FROM numbered n
WHERE a.id = n.id;
