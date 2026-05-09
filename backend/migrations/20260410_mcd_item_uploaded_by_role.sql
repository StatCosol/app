-- Add uploaded_by_role to compliance_mcd_items to track who uploaded evidence (CRM or CLIENT/BRANCH)
ALTER TABLE compliance_mcd_items
  ADD COLUMN IF NOT EXISTS uploaded_by_role VARCHAR(20) DEFAULT NULL;

COMMENT ON COLUMN compliance_mcd_items.uploaded_by_role IS 'Who uploaded: CRM, CLIENT, or BRANCH. NULL = no upload yet';
