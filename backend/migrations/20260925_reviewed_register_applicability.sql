-- Correct the already-deployed seeds without changing their recorded checksums.
-- Review-only register identities must be offered in the override screen, not
-- automatically enabled by DEFAULT_INDIA. This also handles missing package links.
INSERT INTO package_compliance (package_id, compliance_id, included_by_default)
SELECT p.id, c.id, false
FROM compliance_package p CROSS JOIN unit_compliance_master c
WHERE p.code = 'DEFAULT_INDIA'
  AND c.code IN ('WAGES_2019', 'OSH_2020', 'TS_SHOPS_1988', 'SHOPS_2017', 'SOCIAL_SECURITY_2020')
ON CONFLICT (package_id, compliance_id)
DO UPDATE SET included_by_default = false;

-- Remove previously inferred approvals immediately; changing package defaults
-- alone would leave stored AUTO=true decisions usable until recomputation.
-- Preserve explicit OVERRIDE and SPECIAL_SELECTED decisions and their reasons.
WITH previous AS MATERIALIZED (
  SELECT uc.*
  FROM unit_applicable_compliance uc
  JOIN unit_compliance_master c ON c.id = uc.compliance_id
  WHERE c.code IN ('WAGES_2019', 'OSH_2020', 'TS_SHOPS_1988', 'SHOPS_2017', 'SOCIAL_SECURITY_2020')
    AND uc.source = 'AUTO' AND uc.is_applicable = true
  FOR UPDATE OF uc
), repaired AS (
  UPDATE unit_applicable_compliance uc
  SET is_applicable = false, computed_at = now(), computed_by = NULL
  FROM previous p WHERE uc.id = p.id
  RETURNING uc.*
)
INSERT INTO unit_applicability_audit (branch_id, action, before_json, after_json, remarks)
SELECT r.branch_id, 'REGISTER_REVIEW_REQUIRED', to_jsonb(p), to_jsonb(r),
       '20260925: review-only register applicability requires an explicit reviewed decision'
FROM repaired r JOIN previous p ON p.id = r.id;
