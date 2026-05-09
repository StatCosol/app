-- Create compliance coverage view used by admin digest, reports, and compliance-report controller
CREATE OR REPLACE VIEW vw_compliance_coverage AS
SELECT
  c.id                      AS "clientId",
  c.client_name             AS "clientName",
  c.client_name             AS client_name,
  b.id                      AS "branchId",
  b.branchname              AS "branchName",
  b.branchname              AS branch_name,
  b.statecode               AS "stateCode",
  b.statecode               AS state_code,
  COUNT(ct.id)              AS total_compliances,
  COUNT(ct.id) FILTER (WHERE ct.status IN ('APPROVED','SUBMITTED'))
                            AS applicable_count,
  COUNT(ct.id) FILTER (WHERE ct.status NOT IN ('APPROVED','SUBMITTED'))
                            AS not_applicable_count,
  ROUND(
    CASE WHEN COUNT(ct.id) > 0
      THEN 100.0 * COUNT(ct.id) FILTER (WHERE ct.status IN ('APPROVED','SUBMITTED'))
                 / COUNT(ct.id)
      ELSE 0
    END, 2
  )                         AS compliance_percent
FROM clients c
JOIN client_branches b   ON b.clientid = c.id
LEFT JOIN compliance_tasks ct ON ct.client_id = c.id AND ct.branch_id = b.id
WHERE c.is_deleted = false
  AND c.is_active  = true
GROUP BY c.id, c.client_name, b.id, b.branchname, b.statecode;
