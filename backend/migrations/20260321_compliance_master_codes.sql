-- Add authoritative workflow code to compliance_master and backfill existing rows

ALTER TABLE compliance_master
  ADD COLUMN IF NOT EXISTS code varchar(120);

UPDATE compliance_master
SET code = TRIM(BOTH '_' FROM UPPER(REGEXP_REPLACE(
  COALESCE(NULLIF(code, ''), ''),
  '[^A-Z0-9]+',
  '_',
  'g'
)))
WHERE code IS NOT NULL;

UPDATE compliance_master
SET code = CASE
  WHEN UPPER(COALESCE(compliance_name, '')) LIKE '%MONTHLY%COMPLIANCE%DOCUMENT%'
    OR UPPER(COALESCE(compliance_name, '')) LIKE '%MONTHLY%COMPLIANCE%DOCKET%'
    OR UPPER(COALESCE(compliance_name, '')) LIKE '%MCD%'
    THEN 'MCD_UPLOAD'
  WHEN UPPER(COALESCE(compliance_name, '')) LIKE '%PROVIDENT FUND%'
    OR UPPER(COALESCE(compliance_name, '')) LIKE '%PF%'
    THEN 'PF_PAYMENT'
  WHEN UPPER(COALESCE(compliance_name, '')) LIKE '%EMPLOYEES STATE INSURANCE%'
    OR UPPER(COALESCE(compliance_name, '')) LIKE '%ESI%'
    THEN 'ESI_PAYMENT'
  WHEN UPPER(COALESCE(compliance_name, '')) LIKE '%PROFESSIONAL TAX%'
    OR UPPER(COALESCE(compliance_name, '')) LIKE '%PT%'
    THEN 'PT_PAYMENT'
  WHEN UPPER(COALESCE(compliance_name, '')) LIKE '%LABOUR WELFARE FUND%'
    OR UPPER(COALESCE(compliance_name, '')) LIKE '%LWF%'
    THEN 'LWF_PAYMENT'
  WHEN UPPER(COALESCE(compliance_name, '')) LIKE '%GST%'
    THEN 'GST_RETURN'
  WHEN UPPER(COALESCE(compliance_name, '')) LIKE '%TDS%'
    THEN 'TDS_RETURN'
  WHEN UPPER(COALESCE(compliance_name, '')) LIKE '%ROC%'
    THEN 'ROC_FILINGS'
  ELSE TRIM(BOTH '_' FROM UPPER(REGEXP_REPLACE(
    COALESCE(NULLIF(compliance_name, ''), 'COMPLIANCE_ITEM'),
    '[^A-Z0-9]+',
    '_',
    'g'
  )))
END
WHERE code IS NULL OR BTRIM(code) = '';

UPDATE compliance_master
SET code = 'COMPLIANCE_ITEM'
WHERE code IS NULL OR BTRIM(code) = '';

ALTER TABLE compliance_master
  ALTER COLUMN code SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_compliance_master_code
  ON compliance_master(code);
