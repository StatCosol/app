-- Speed up contractor employee duplicate-registration checks without
-- failing deploys on historical duplicate rows.

CREATE INDEX IF NOT EXISTS idx_contractor_emp_active_name_lookup
  ON contractor_employees (
    client_id,
    contractor_user_id,
    branch_id,
    lower(btrim(name))
  )
  WHERE is_active IS TRUE OR status IN ('ACTIVE', 'PENDING_DELETE');

CREATE INDEX IF NOT EXISTS idx_contractor_emp_active_aadhaar_lookup
  ON contractor_employees (
    client_id,
    aadhaar
  )
  WHERE aadhaar IS NOT NULL
    AND btrim(aadhaar) <> ''
    AND (is_active IS TRUE OR status IN ('ACTIVE', 'PENDING_DELETE'));
