/**
 * Auditor Dashboard SQL Queries
 * Raw SQL with USER SCOPING enforced via my_audits CTE
 * Auditor can only see audits assigned to them
 * Uses positional parameters ($1, $2, etc.) for PostgreSQL
 */

/**
 * C1) GET /api/auditor/dashboard/summary
 * Parameters: $1=auditorUserId (JWT), $2=clientId, $3=fromDate, $4=toDate, $5=windowDays
 * ⚠️ CRITICAL: $1 must come from JWT token, never from query params
 */
export const AUDITOR_SUMMARY_SQL = `
WITH my_audits AS (
  SELECT a.*
  FROM audits a
  WHERE a.assigned_auditor_id = $1::uuid
    AND ($2::uuid IS NULL OR a.client_id = $2)
    AND ($3::date IS NULL OR a.due_date >= $3)
    AND ($4::date IS NULL OR a.due_date <= $4)
),
obs AS (
  SELECT
    COUNT(*) FILTER (WHERE o.status <> 'CLOSED') AS open_cnt,
    COUNT(*) FILTER (WHERE o.status <> 'CLOSED' AND o.risk='HIGH') AS high_open_cnt
  FROM audit_observations o
  JOIN my_audits a ON a.id = o.audit_id
),
reports AS (
  SELECT COUNT(*) AS pending_cnt
  FROM my_audits a
  WHERE a.status = 'COMPLETED'
)
SELECT
  (SELECT COUNT(*) FROM my_audits WHERE status IN ('ASSIGNED','IN_PROGRESS')) AS assigned_audits_count,
  (SELECT COUNT(*) FROM my_audits WHERE status IN ('ASSIGNED','IN_PROGRESS') AND due_date < CURRENT_DATE) AS overdue_audits_count,
  (SELECT COUNT(*) FROM my_audits WHERE status IN ('ASSIGNED','IN_PROGRESS')
     AND due_date >= CURRENT_DATE
     AND due_date < (CURRENT_DATE + ($5::int || ' days')::interval)
  ) AS due_soon_audits_count,
  (SELECT open_cnt FROM obs) AS observations_open_count,
  (SELECT high_open_cnt FROM obs) AS high_risk_open_count,
  (SELECT pending_cnt FROM reports) AS reports_pending_count;
`;

/**
 * C2) GET /api/auditor/dashboard/audits
 * Parameters: $1=auditorUserId (JWT), $2=clientId, $3=fromDate, $4=toDate, $5=windowDays, $6=tab, $7=limit, $8=offset
 */
export const AUDITOR_AUDITS_SQL = `
WITH my_audits AS (
  SELECT a.*
  FROM audits a
  WHERE a.assigned_auditor_id = $1
    AND ($2::uuid IS NULL OR a.client_id = $2)
    AND ($3::date IS NULL OR a.due_date >= $3)
    AND ($4::date IS NULL OR a.due_date <= $4)
)
SELECT
  a.id AS audit_id,
  a.client_id,
  c.client_name AS client_name,
  a.branch_id,
  b.branchname AS branch_name,
  a.audit_type,
  a.audit_code AS audit_name,
  a.due_date,
  a.status,
  a.score AS progress_pct,
  a.updated_at AS last_updated_at
FROM my_audits a
LEFT JOIN clients c ON c.id = a.client_id
LEFT JOIN client_branches b ON b.id = a.branch_id
WHERE
  (
    ($6::text = 'ACTIVE' AND a.status IN ('ASSIGNED','IN_PROGRESS'))
    OR ($6::text = 'OVERDUE' AND a.status IN ('ASSIGNED','IN_PROGRESS') AND a.due_date < CURRENT_DATE)
    OR ($6::text = 'DUE_SOON' AND a.status IN ('ASSIGNED','IN_PROGRESS')
        AND a.due_date >= CURRENT_DATE
        AND a.due_date < (CURRENT_DATE + ($5::int || ' days')::interval))
    OR ($6::text = 'COMPLETED' AND a.status IN ('COMPLETED','SUBMITTED'))
  )
ORDER BY a.due_date ASC, a.updated_at DESC
LIMIT $7 OFFSET $8;
`;

/**
 * C3) GET /api/auditor/dashboard/observations
 * Parameters: $1=auditorUserId (JWT), $2=clientId, $3=status, $4=risk, $5=limit, $6=offset
 */
export const AUDITOR_OBSERVATIONS_SQL = `
WITH my_audits AS (
  SELECT a.id, a.contractor_user_id
  FROM audits a
  WHERE a.assigned_auditor_id = $1::uuid
    AND ($2::uuid IS NULL OR a.client_id = $2)
)
SELECT
  o.id            AS "observationId",
  o.audit_id      AS "auditId",
  a.client_id     AS "clientId",
  c.client_name   AS "clientName",
  a.branch_id     AS "branchId",
  br.branchname   AS "branchName",
  o.observation   AS "title",
  o.risk,
  o.status,
  (CURRENT_DATE - o.created_at::date) AS "ageingDays",
  COALESCE(ou.name, br.branchname, 'Unassigned') AS "ownerName",
  CASE WHEN a.contractor_user_id IS NOT NULL THEN 'CONTRACTOR' ELSE 'BRANCH' END AS "ownerRole",
  o.created_at    AS "createdAt"
FROM audit_observations o
JOIN audits a ON a.id = o.audit_id
JOIN my_audits ma ON ma.id = o.audit_id
LEFT JOIN clients c ON c.id = a.client_id
LEFT JOIN client_branches br ON br.id = a.branch_id
LEFT JOIN users ou ON ou.id = a.contractor_user_id
WHERE ($3::text IS NULL OR o.status = $3)
  AND ($4::text IS NULL OR o.risk = $4)
ORDER BY o.risk DESC, (CURRENT_DATE - o.created_at::date) DESC
LIMIT $5 OFFSET $6;
`;

/**
 * C4) GET /api/auditor/dashboard/reports
 * Parameters: $1=auditorUserId (JWT), $2=status, $3=clientId, $4=fromDate, $5=toDate, $6=limit, $7=offset
 */
export const AUDITOR_REPORTS_SQL = `
SELECT
  a.id AS audit_id,
  a.client_id,
  c.client_name AS client_name,
  a.branch_id,
  b.branchname AS branch_name,
  a.due_date,
  a.status,
  a.updated_at AS last_updated_at
FROM audits a
LEFT JOIN clients c ON c.id = a.client_id
LEFT JOIN client_branches b ON b.id = a.branch_id
WHERE a.assigned_auditor_id = $1
  AND (
    ($2::text = 'PENDING_SUBMISSION' AND a.status = 'COMPLETED')
    OR ($2::text = 'SUBMITTED' AND a.status = 'SUBMITTED')
    OR ($2::text IS NULL)
  )
  AND ($3::uuid IS NULL OR a.client_id = $3)
  AND ($4::date IS NULL OR a.due_date >= $4)
  AND ($5::date IS NULL OR a.due_date <= $5)
ORDER BY a.due_date ASC, a.updated_at DESC
LIMIT $6 OFFSET $7;
`;
