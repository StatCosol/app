/**
 * CRM Dashboard SQL Queries
 * Raw SQL with USER SCOPING enforced via crm_clients CTE
 * CRM can only see clients assigned to them via client_assignments_current
 * Uses positional parameters ($1, $2, etc.) for PostgreSQL
 */

/**
 * B1) GET /api/crm/dashboard/summary
 * Parameters: $1=crmUserId (JWT), $2=clientId, $3=fromDate, $4=toDate, $5=windowDays
 * ⚠️ CRITICAL: $1 must come from JWT token, never from query params
 */
export const CRM_SUMMARY_SQL = `
WITH crm_clients AS (
  SELECT ca.client_id
  FROM client_assignments_current ca
  WHERE ca.assignment_type = 'CRM'
    AND ca.assigned_to_user_id = $1::uuid
),
crm_branches AS (
  SELECT b.id, b.client_id
  FROM branches b
  JOIN crm_clients cc ON cc.client_id = b.client_id
  WHERE b.is_active = TRUE
),
due_in_period AS (
  SELECT
    COUNT(*) FILTER (WHERE ct.status IN ('OPEN', 'IN_PROGRESS', 'PENDING') AND ct.due_date IS NOT NULL) AS total_items,
    COUNT(*) FILTER (WHERE ct.status = 'COMPLETED') AS completed_items,
    COUNT(*) FILTER (WHERE ct.status IN ('OPEN', 'IN_PROGRESS', 'PENDING') AND ct.due_date < CURRENT_DATE) AS overdue_cnt,
    COUNT(*) FILTER (
      WHERE ct.status IN ('OPEN', 'IN_PROGRESS', 'PENDING')
        AND ct.due_date >= CURRENT_DATE
        AND ct.due_date < (CURRENT_DATE + (COALESCE($5::int, 30) || ' days')::interval)
    ) AS due_soon_cnt
  FROM compliance_tasks ct
  JOIN crm_branches b ON b.id = ct.branch_id
  WHERE ($2::uuid IS NULL OR b.client_id = $2)
    AND ($3::date IS NULL OR ct.due_date >= $3)
    AND ($4::date IS NULL OR ct.due_date <= $4)
),
open_queries AS (
  SELECT 0 AS cnt
)
SELECT
  (SELECT COUNT(*) FROM crm_clients) AS assigned_clients_count,
  (SELECT COUNT(*) FROM crm_branches WHERE ($2::uuid IS NULL OR client_id = $2)) AS assigned_branches_count,
  CASE
    WHEN (SELECT total_items FROM due_in_period) = 0 THEN NULL
    ELSE ROUND(100.0 * (SELECT completed_items FROM due_in_period) / NULLIF((SELECT total_items FROM due_in_period),0))::int
  END AS compliance_coverage_pct,
  (SELECT overdue_cnt FROM due_in_period) AS overdue_compliances_count,
  (SELECT due_soon_cnt FROM due_in_period) AS due_soon_compliances_count,
  (SELECT cnt FROM open_queries) AS open_compliance_queries_count;
`;

/**
 * B2) GET /api/crm/dashboard/due-compliances
 * Parameters: $1=crmUserId (JWT), $2=clientId, $3=branchId, $4=fromDate, $5=toDate, $6=tab, $7=windowDays, $8=limit, $9=offset
 */
export const CRM_DUE_COMPLIANCES_SQL = `
WITH crm_clients AS (
  SELECT ca.client_id
  FROM client_assignments_current ca
  WHERE ca.assignment_type = 'CRM'
    AND ca.assigned_to_user_id = $1::uuid
),
crm_branches AS (
  SELECT b.id, b.client_id, b.branch_name
  FROM branches b
  JOIN crm_clients cc ON cc.client_id = b.client_id
  WHERE b.is_active = TRUE
),
base AS (
  SELECT
    ct.id AS schedule_id,
    b.client_id,
    b.branch_name,
    ct.branch_id,
    COALESCE(cm.law_family, 'General') AS category,
    COALESCE(cm.compliance_name, ct.title) AS compliance_item,
    'MEDIUM' AS risk,
    ct.due_date,
    (CURRENT_DATE - ct.due_date) AS days_overdue,
    ct.status
  FROM compliance_tasks ct
  JOIN crm_branches b ON b.id = ct.branch_id
  LEFT JOIN compliance_master cm ON cm.id = ct.compliance_id
  WHERE ($2::uuid IS NULL OR b.client_id = $2)
    AND ($3::uuid IS NULL OR ct.branch_id = $3)
    AND ($4::date IS NULL OR ct.due_date >= $4)
    AND ($5::date IS NULL OR ct.due_date <= $5)
    AND ct.due_date IS NOT NULL
)
SELECT
  base.schedule_id,
  base.client_id,
  c.client_name,
  base.branch_id,
  base.branch_name,
  base.category,
  base.compliance_item,
  base.risk,
  base.due_date,
  GREATEST(base.days_overdue, 0) AS days_overdue,
  base.status
FROM base
JOIN clients c ON c.id = base.client_id
WHERE base.status IN ('OPEN', 'IN_PROGRESS', 'PENDING')
  AND (
    ($6::text = 'OVERDUE' AND base.due_date < CURRENT_DATE)
    OR ($6::text = 'DUE_SOON' AND base.due_date >= CURRENT_DATE AND base.due_date < (CURRENT_DATE + (COALESCE($7::int, 30) || ' days')::interval))
    OR ($6::text = 'THIS_MONTH' AND date_trunc('month', base.due_date) = date_trunc('month', CURRENT_DATE))
  )
ORDER BY base.due_date ASC
LIMIT $8 OFFSET $9;
`;

/**
 * B3) GET /api/crm/dashboard/low-coverage-branches
 * Parameters: $1=crmUserId (JWT), $2=clientId, $3=fromDate, $4=toDate, $5=limit, $6=offset
 */
export const CRM_LOW_COVERAGE_BRANCHES_SQL = `
WITH crm_clients AS (
  SELECT ca.client_id
  FROM client_assignments_current ca
  WHERE ca.assignment_type = 'CRM'
    AND ca.assigned_to_user_id = $1::uuid
),
scope_branches AS (
  SELECT b.id AS branch_id, b.client_id, b.branch_name
  FROM branches b
  JOIN crm_clients cc ON cc.client_id = b.client_id
  WHERE b.is_active = TRUE
),
agg AS (
  SELECT
    sb.client_id,
    sb.branch_id,
    sb.branch_name,
    COUNT(*) FILTER (WHERE ct.status IN ('OPEN', 'IN_PROGRESS', 'PENDING', 'COMPLETED') AND ct.due_date IS NOT NULL) AS total_items,
    COUNT(*) FILTER (WHERE ct.status='COMPLETED') AS completed_items,
    COUNT(*) FILTER (WHERE ct.status IN ('OPEN', 'IN_PROGRESS', 'PENDING') AND ct.due_date < CURRENT_DATE) AS overdue_count,
    COUNT(*) FILTER (WHERE ct.status IN ('OPEN', 'IN_PROGRESS', 'PENDING')) AS high_risk_pending
  FROM scope_branches sb
  LEFT JOIN compliance_tasks ct ON ct.branch_id = sb.branch_id
    AND ($3::date IS NULL OR ct.due_date >= $3)
    AND ($4::date IS NULL OR ct.due_date <= $4)
  WHERE ($2::uuid IS NULL OR sb.client_id = $2)
  GROUP BY sb.client_id, sb.branch_id, sb.branch_name
)
SELECT
  a.client_id,
  c.client_name,
  a.branch_id,
  a.branch_name,
  CASE WHEN a.total_items = 0 THEN NULL
       ELSE ROUND(100.0 * a.completed_items / NULLIF(a.total_items,0))::int
  END AS coverage_pct,
  a.overdue_count,
  a.high_risk_pending
FROM agg a
JOIN clients c ON c.id = a.client_id
WHERE (CASE WHEN a.total_items = 0 THEN 100 ELSE (100.0 * a.completed_items / NULLIF(a.total_items,0)) END) < 70
   OR a.overdue_count >= 5
ORDER BY overdue_count DESC, coverage_pct ASC NULLS LAST
LIMIT $5 OFFSET $6;
`;

/**
 * B4) GET /api/crm/dashboard/queries
 * Parameters: $1=crmUserId (JWT), $2=status, $3=clientId, $4=fromDate, $5=toDate, $6=limit, $7=offset
 */
export const CRM_QUERIES_SQL = `
SELECT
  NULL::uuid AS query_id,
  NULL::text AS from_role,
  NULL::text AS from_name,
  NULL::uuid AS client_id,
  NULL::text AS client_name,
  NULL::uuid AS branch_id,
  NULL::text AS branch_name,
  NULL::text AS subject,
  NULL::int AS ageing_days,
  NULL::text AS status,
  NULL::timestamptz AS created_at
WHERE $1::uuid IS NOT NULL
  AND $2::text IS NOT NULL
  AND $3::uuid IS NOT NULL
  AND $4::date IS NOT NULL
  AND $5::date IS NOT NULL
  AND 1=0
LIMIT $6::int OFFSET $7::int;
`;
