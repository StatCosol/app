/**
 * CRM Dashboard SQL Queries
 * Raw SQL with USER SCOPING enforced via crm_clients CTE
 * CRM can only see clients assigned to them via client_assignments_current
 * Uses positional parameters ($1, $2, etc.) for PostgreSQL
 */

/* ═══════════════════════════════════════════════════════════════
   V2 Dashboard Queries (redesigned)
   ═══════════════════════════════════════════════════════════════ */

/**
 * Dashboard KPI cards (8 metrics) — V2 MCD-based
 * Sources from compliance_mcd_items (MCD workflow) instead of
 * contractor_documents / audit_observations (ConTrack / AuditXpert — not yet live).
 * $1 = crmUserId (JWT)
 */
export const CRM_DASHBOARD_KPI_SQL = `
WITH crm_clients AS (
  SELECT ca.client_id
  FROM client_assignments_current ca
  WHERE ca.assignment_type = 'CRM'
    AND ca.assigned_to_user_id = $1::uuid
),
crm_branches AS (
  SELECT b.id AS branch_id, b.clientid AS client_id
  FROM client_branches b
  JOIN crm_clients cc ON cc.client_id = b.clientid
  WHERE b.isactive = TRUE
),
-- MCD items for the current month across CRM-assigned branches
mcd_agg AS (
  SELECT
    COUNT(*) FILTER (WHERE mci.status = 'SUBMITTED')  AS pending_review_count,
    COUNT(*) FILTER (WHERE mci.status = 'REJECTED')   AS reupload_required_count,
    COUNT(*) FILTER (WHERE mci.status = 'PENDING')    AS mcd_pending_count,
    COUNT(*) FILTER (WHERE mci.status = 'VERIFIED')   AS verified_count,
    COUNT(*) FILTER (WHERE mci.required = TRUE)       AS total_required
  FROM compliance_mcd_items mci
  JOIN compliance_tasks ct ON ct.id = mci.task_id
  JOIN crm_branches cb ON cb.branch_id = ct.branch_id
  WHERE ct.period_year  = EXTRACT(YEAR  FROM CURRENT_DATE)::int
    AND ct.period_month = EXTRACT(MONTH FROM CURRENT_DATE)::int
),
-- Compliance tasks overdue / expiring in 30 days
task_agg AS (
  SELECT
    COUNT(*) FILTER (
      WHERE ct.status IN ('PENDING','IN_PROGRESS','SUBMITTED')
        AND ct.due_date < CURRENT_DATE
    ) AS overdue_count,
    COUNT(*) FILTER (
      WHERE ct.due_date >= CURRENT_DATE
        AND ct.due_date <= CURRENT_DATE + interval '30 days'
        AND ct.status NOT IN ('APPROVED')
    ) AS expiring_30_count
  FROM compliance_tasks ct
  JOIN crm_branches cb ON cb.branch_id = ct.branch_id
),
-- Reupload request backlog (client vs branch breakdown)
reupload_agg AS (
  SELECT
    COUNT(*) FILTER (WHERE dr.status = 'OPEN')                            AS reupload_open,
    COUNT(*) FILTER (WHERE dr.status = 'SUBMITTED')                       AS reupload_submitted,
    COUNT(*) FILTER (WHERE dr.status = 'OPEN' AND dr.target_role = 'CLIENT')  AS reupload_open_client,
    COUNT(*) FILTER (WHERE dr.status = 'OPEN' AND dr.target_role = 'BRANCH')  AS reupload_open_branch,
    COUNT(*) FILTER (WHERE dr.status = 'SUBMITTED' AND dr.target_role = 'CLIENT') AS reupload_submitted_client,
    COUNT(*) FILTER (WHERE dr.status = 'SUBMITTED' AND dr.target_role = 'BRANCH') AS reupload_submitted_branch
  FROM document_reupload_requests dr
  JOIN crm_clients cc ON cc.client_id = dr.client_id
)
SELECT
  (SELECT COUNT(*) FROM crm_clients)                      AS assigned_clients_count,
  CASE WHEN (SELECT total_required FROM mcd_agg) = 0 THEN 0
       ELSE ROUND(100.0 * (SELECT verified_count FROM mcd_agg)
                  / NULLIF((SELECT total_required FROM mcd_agg), 0))::int
  END                                                     AS compliance_pct,
  COALESCE((SELECT pending_review_count  FROM mcd_agg), 0) AS pending_review_count,
  COALESCE((SELECT reupload_required_count FROM mcd_agg), 0) AS reupload_required_count,
  COALESCE((SELECT overdue_count   FROM task_agg), 0)      AS overdue_count,
  COALESCE((SELECT expiring_30_count FROM task_agg), 0)    AS expiring_30_count,
  0                                                        AS open_observations_count,
  COALESCE((SELECT mcd_pending_count FROM mcd_agg), 0)     AS mcd_pending_count,
  COALESCE((SELECT reupload_open FROM reupload_agg), 0)    AS reupload_open,
  COALESCE((SELECT reupload_submitted FROM reupload_agg), 0) AS reupload_submitted,
  COALESCE((SELECT reupload_open_client FROM reupload_agg), 0) AS reupload_open_client,
  COALESCE((SELECT reupload_open_branch FROM reupload_agg), 0) AS reupload_open_branch,
  COALESCE((SELECT reupload_submitted_client FROM reupload_agg), 0) AS reupload_submitted_client,
  COALESCE((SELECT reupload_submitted_branch FROM reupload_agg), 0) AS reupload_submitted_branch;
`;

/**
 * Priority Today — top urgent items (MCD-based)
 * Surfaces: overdue compliance tasks, MCD items submitted (awaiting CRM review),
 * and MCD items rejected (needing re-upload).
 * $1 = crmUserId, $2 = limit
 */
export const CRM_PRIORITY_TODAY_SQL = `
WITH crm_clients AS (
  SELECT ca.client_id
  FROM client_assignments_current ca
  WHERE ca.assignment_type = 'CRM'
    AND ca.assigned_to_user_id = $1::uuid
),
crm_branches AS (
  SELECT b.id AS branch_id, b.clientid AS client_id
  FROM client_branches b
  JOIN crm_clients cc ON cc.client_id = b.clientid
  WHERE b.isactive = TRUE
),
overdue_tasks AS (
  SELECT
    'OVERDUE_TASK'::text AS item_type,
    c.client_name,
    b.branchname,
    NULL::text AS contractor_name,
    COALESCE(cm.compliance_name, ct.title) AS item_name,
    COALESCE(cm.law_family, 'General')     AS compliance_type,
    (CURRENT_DATE - ct.due_date)           AS days_overdue,
    ct.id::text                            AS ref_id
  FROM compliance_tasks ct
  JOIN client_branches b ON b.id = ct.branch_id
  JOIN clients  c ON c.id = ct.client_id
  JOIN crm_clients cc ON cc.client_id = c.id
  LEFT JOIN compliance_master cm ON cm.id = ct.compliance_id
  WHERE ct.status IN ('PENDING','IN_PROGRESS','SUBMITTED')
    AND ct.due_date < CURRENT_DATE
),
mcd_submitted AS (
  SELECT
    'MCD_PENDING_REVIEW'::text AS item_type,
    c.client_name,
    b.branchname,
    NULL::text AS contractor_name,
    mci.item_label AS item_name,
    COALESCE(cm.law_family, 'MCD')         AS compliance_type,
    (CURRENT_DATE - mci.updated_at::date)  AS days_overdue,
    mci.id::text                           AS ref_id
  FROM compliance_mcd_items mci
  JOIN compliance_tasks ct ON ct.id = mci.task_id
  JOIN crm_branches cb ON cb.branch_id = ct.branch_id
  JOIN client_branches b ON b.id = ct.branch_id
  JOIN clients  c ON c.id = ct.client_id
  LEFT JOIN compliance_master cm ON cm.id = ct.compliance_id
  WHERE mci.status = 'SUBMITTED'
    AND ct.period_year  = EXTRACT(YEAR  FROM CURRENT_DATE)::int
    AND ct.period_month = EXTRACT(MONTH FROM CURRENT_DATE)::int
),
mcd_rejected AS (
  SELECT
    'MCD_REUPLOAD'::text AS item_type,
    c.client_name,
    b.branchname,
    NULL::text AS contractor_name,
    mci.item_label AS item_name,
    COALESCE(cm.law_family, 'MCD')         AS compliance_type,
    (CURRENT_DATE - mci.updated_at::date)  AS days_overdue,
    mci.id::text                           AS ref_id
  FROM compliance_mcd_items mci
  JOIN compliance_tasks ct ON ct.id = mci.task_id
  JOIN crm_branches cb ON cb.branch_id = ct.branch_id
  JOIN client_branches b ON b.id = ct.branch_id
  JOIN clients  c ON c.id = ct.client_id
  LEFT JOIN compliance_master cm ON cm.id = ct.compliance_id
  WHERE mci.status = 'REJECTED'
    AND ct.period_year  = EXTRACT(YEAR  FROM CURRENT_DATE)::int
    AND ct.period_month = EXTRACT(MONTH FROM CURRENT_DATE)::int
)
SELECT * FROM (
  SELECT * FROM overdue_tasks
  UNION ALL SELECT * FROM mcd_submitted
  UNION ALL SELECT * FROM mcd_rejected
) combined
ORDER BY days_overdue DESC NULLS LAST
LIMIT $2;
`;

/**
 * Top Risk Clients (top 10) — MCD-based
 * Ranks clients by MCD compliance % (lowest first), pending/rejected MCD items.
 * $1 = crmUserId, $2 = limit
 */
export const CRM_TOP_RISK_CLIENTS_SQL = `
WITH crm_clients AS (
  SELECT ca.client_id
  FROM client_assignments_current ca
  WHERE ca.assignment_type = 'CRM'
    AND ca.assigned_to_user_id = $1::uuid
),
crm_branches AS (
  SELECT b.id AS branch_id, b.clientid AS client_id
  FROM client_branches b
  JOIN crm_clients cc ON cc.client_id = b.clientid
  WHERE b.isactive = TRUE
),
-- MCD stats per client for current month
mcd_per_client AS (
  SELECT
    ct.client_id,
    COUNT(*) FILTER (WHERE mci.required = TRUE)                AS total_required,
    COUNT(*) FILTER (WHERE mci.status = 'VERIFIED')            AS verified_count,
    COUNT(*) FILTER (WHERE mci.status = 'SUBMITTED')           AS pending_count,
    COUNT(*) FILTER (WHERE mci.status = 'REJECTED')            AS reupload_count,
    COUNT(*) FILTER (WHERE mci.status = 'PENDING' AND mci.required = TRUE) AS mcd_pending
  FROM compliance_mcd_items mci
  JOIN compliance_tasks ct ON ct.id = mci.task_id
  JOIN crm_branches cb ON cb.branch_id = ct.branch_id
  WHERE ct.period_year  = EXTRACT(YEAR  FROM CURRENT_DATE)::int
    AND ct.period_month = EXTRACT(MONTH FROM CURRENT_DATE)::int
  GROUP BY ct.client_id
),
-- Overdue compliance tasks per client
overdue_per_client AS (
  SELECT
    ct.client_id,
    COUNT(*) AS overdue_count
  FROM compliance_tasks ct
  JOIN crm_branches cb ON cb.branch_id = ct.branch_id
  WHERE ct.status IN ('PENDING','IN_PROGRESS','SUBMITTED')
    AND ct.due_date < CURRENT_DATE
  GROUP BY ct.client_id
)
SELECT
  c.id              AS client_id,
  c.client_name,
  CASE WHEN COALESCE(m.total_required, 0) = 0 THEN 0
       ELSE ROUND(100.0 * COALESCE(m.verified_count, 0)
                  / NULLIF(m.total_required, 0))::int
  END                                          AS compliance_pct,
  COALESCE(m.pending_count, 0)                 AS pending_count,
  COALESCE(m.reupload_count, 0)                AS reupload_count,
  0                                            AS open_observations,
  COALESCE(o.overdue_count, 0)                 AS expiring_count
FROM crm_clients cc
JOIN clients c ON c.id = cc.client_id
LEFT JOIN mcd_per_client m ON m.client_id = c.id
LEFT JOIN overdue_per_client o ON o.client_id = c.id
ORDER BY compliance_pct ASC, expiring_count DESC
LIMIT $2;
`;

/**
 * Upcoming Audits (next N days)
 * $1 = crmUserId, $2 = days (int)
 */
export const CRM_UPCOMING_AUDITS_SQL = `
WITH crm_clients AS (
  SELECT ca.client_id
  FROM client_assignments_current ca
  WHERE ca.assignment_type = 'CRM'
    AND ca.assigned_to_user_id = $1::uuid
)
SELECT
  a.id              AS audit_id,
  a.audit_code,
  a.audit_type,
  c.client_name,
  b.branchname,
  u.name            AS auditor_name,
  a.due_date,
  a.status,
  (a.due_date - CURRENT_DATE) AS days_until
FROM audits a
JOIN clients c ON c.id = a.client_id
JOIN crm_clients cc ON cc.client_id = c.id
LEFT JOIN client_branches b ON b.id = a.branch_id
LEFT JOIN users u ON u.id = a.assigned_auditor_id
WHERE a.status IN ('PLANNED','IN_PROGRESS')
  AND a.due_date IS NOT NULL
  AND a.due_date >= CURRENT_DATE
  AND a.due_date <= CURRENT_DATE + ($2 || ' days')::interval
ORDER BY a.due_date ASC;
`;

/* ═══════════════════════════════════════════════════════════════
   Legacy V1 Queries (kept for backward-compat)
   ═══════════════════════════════════════════════════════════════ */

/** @deprecated Use CRM_DASHBOARD_KPI_SQL instead */
export const CRM_SUMMARY_SQL = `
WITH crm_clients AS (
  SELECT ca.client_id
  FROM client_assignments_current ca
  WHERE ca.assignment_type = 'CRM'
    AND ca.assigned_to_user_id = $1::uuid
),
crm_branches AS (
  SELECT b.id, b.clientid AS client_id
  FROM client_branches b
  JOIN crm_clients cc ON cc.client_id = b.clientid
  WHERE b.isactive = TRUE
),
due_in_period AS (
  SELECT
    COUNT(*) FILTER (WHERE ct.status IN ('PENDING', 'IN_PROGRESS', 'SUBMITTED') AND ct.due_date IS NOT NULL) AS total_items,
    COUNT(*) FILTER (WHERE ct.status = 'APPROVED') AS completed_items,
    COUNT(*) FILTER (WHERE ct.status IN ('PENDING', 'IN_PROGRESS', 'SUBMITTED') AND ct.due_date < CURRENT_DATE) AS overdue_cnt,
    COUNT(*) FILTER (
      WHERE ct.status IN ('PENDING', 'IN_PROGRESS', 'SUBMITTED')
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
  SELECT b.id, b.clientid AS client_id, b.branchname AS branch_name
  FROM client_branches b
  JOIN crm_clients cc ON cc.client_id = b.clientid
  WHERE b.isactive = TRUE
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
WHERE base.status IN ('PENDING', 'IN_PROGRESS', 'SUBMITTED')
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
  SELECT b.id AS branch_id, b.clientid AS client_id, b.branchname AS branch_name
  FROM client_branches b
  JOIN crm_clients cc ON cc.client_id = b.clientid
  WHERE b.isactive = TRUE
),
agg AS (
  SELECT
    sb.client_id,
    sb.branch_id,
    sb.branch_name,
    COUNT(*) FILTER (WHERE ct.status IN ('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED') AND ct.due_date IS NOT NULL) AS total_items,
    COUNT(*) FILTER (WHERE ct.status='APPROVED') AS completed_items,
    COUNT(*) FILTER (WHERE ct.status IN ('PENDING', 'IN_PROGRESS', 'SUBMITTED') AND ct.due_date < CURRENT_DATE) AS overdue_count,
    COUNT(*) FILTER (WHERE ct.status IN ('PENDING', 'IN_PROGRESS', 'SUBMITTED')) AS high_risk_pending
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
