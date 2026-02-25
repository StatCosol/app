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
 * Dashboard KPI cards (8 metrics)
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
  SELECT b.id AS branch_id, b.client_id
  FROM branches b
  JOIN crm_clients cc ON cc.client_id = b.client_id
  WHERE b.is_active = TRUE
),
task_agg AS (
  SELECT
    COUNT(*) FILTER (WHERE ct.due_date IS NOT NULL) AS total_tasks,
    COUNT(*) FILTER (WHERE ct.status = 'COMPLETED') AS completed_tasks,
    COUNT(*) FILTER (WHERE ct.status IN ('OPEN','IN_PROGRESS','PENDING') AND ct.due_date < CURRENT_DATE) AS overdue_count
  FROM compliance_tasks ct
  JOIN crm_branches cb ON cb.branch_id = ct.branch_id
),
doc_agg AS (
  SELECT
    COUNT(*) FILTER (WHERE cd.status IN ('UPLOADED','PENDING_REVIEW')) AS pending_review_count,
    COUNT(*) FILTER (WHERE cd.status = 'REJECTED') AS reupload_required_count,
    COUNT(*) FILTER (
      WHERE cd.expiry_date IS NOT NULL
        AND cd.expiry_date >= CURRENT_DATE
        AND cd.expiry_date <= CURRENT_DATE + interval '30 days'
    ) AS expiring_30_count
  FROM contractor_documents cd
  JOIN crm_clients cc ON cc.client_id = cd.client_id
),
obs_agg AS (
  SELECT COUNT(*) AS open_observations_count
  FROM audit_observations ao
  JOIN audits a ON a.id = ao.audit_id
  JOIN crm_clients cc ON cc.client_id = a.client_id
  WHERE ao.status IN ('OPEN')
),
mcd_agg AS (
  SELECT COUNT(*) AS mcd_pending_count
  FROM compliance_mcd_items mci
  JOIN compliance_tasks ct ON ct.id = mci.task_id
  JOIN crm_branches cb ON cb.branch_id = ct.branch_id
  WHERE mci.status = 'PENDING'
    AND ct.period_year  = EXTRACT(YEAR  FROM CURRENT_DATE)::int
    AND ct.period_month = EXTRACT(MONTH FROM CURRENT_DATE)::int
)
SELECT
  (SELECT COUNT(*) FROM crm_clients)          AS assigned_clients_count,
  CASE WHEN (SELECT total_tasks FROM task_agg) = 0 THEN 0
       ELSE ROUND(100.0 * (SELECT completed_tasks FROM task_agg)
                  / NULLIF((SELECT total_tasks FROM task_agg), 0))::int
  END                                         AS compliance_pct,
  (SELECT pending_review_count FROM doc_agg)  AS pending_review_count,
  (SELECT reupload_required_count FROM doc_agg) AS reupload_required_count,
  (SELECT overdue_count FROM task_agg)        AS overdue_count,
  (SELECT expiring_30_count FROM doc_agg)     AS expiring_30_count,
  (SELECT open_observations_count FROM obs_agg) AS open_observations_count,
  (SELECT mcd_pending_count FROM mcd_agg)     AS mcd_pending_count;
`;

/**
 * Priority Today — top urgent items
 * $1 = crmUserId, $2 = limit
 */
export const CRM_PRIORITY_TODAY_SQL = `
WITH crm_clients AS (
  SELECT ca.client_id
  FROM client_assignments_current ca
  WHERE ca.assignment_type = 'CRM'
    AND ca.assigned_to_user_id = $1::uuid
),
overdue_tasks AS (
  SELECT
    'OVERDUE_TASK'::text AS item_type,
    c.client_name, b.branch_name,
    NULL::text AS contractor_name,
    COALESCE(cm.compliance_name, ct.title) AS item_name,
    COALESCE(cm.law_family, 'General')    AS compliance_type,
    (CURRENT_DATE - ct.due_date)          AS days_overdue,
    ct.id::text                           AS ref_id
  FROM compliance_tasks ct
  JOIN branches b ON b.id = ct.branch_id
  JOIN clients  c ON c.id = ct.client_id
  JOIN crm_clients cc ON cc.client_id = c.id
  LEFT JOIN compliance_master cm ON cm.id = ct.compliance_id
  WHERE ct.status IN ('OPEN','IN_PROGRESS','PENDING')
    AND ct.due_date < CURRENT_DATE
),
expired_docs AS (
  SELECT
    'EXPIRED_DOC'::text AS item_type,
    c.client_name, b.branch_name,
    u.name          AS contractor_name,
    cd.title        AS item_name,
    cd.doc_type     AS compliance_type,
    (CURRENT_DATE - cd.expiry_date) AS days_overdue,
    cd.id::text     AS ref_id
  FROM contractor_documents cd
  JOIN clients c ON c.id = cd.client_id
  LEFT JOIN branches b ON b.id = cd.branch_id
  JOIN users u ON u.id = cd.contractor_user_id
  JOIN crm_clients cc ON cc.client_id = c.id
  WHERE cd.expiry_date IS NOT NULL AND cd.expiry_date < CURRENT_DATE
    AND cd.status NOT IN ('APPROVED')
),
high_risk_obs AS (
  SELECT
    'HIGH_RISK_OBS'::text AS item_type,
    c.client_name, b.branch_name,
    NULL::text        AS contractor_name,
    ao.title          AS item_name,
    ao.severity       AS compliance_type,
    EXTRACT(DAY FROM NOW() - ao.created_at)::int AS days_overdue,
    ao.id::text       AS ref_id
  FROM audit_observations ao
  JOIN audits  a ON a.id = ao.audit_id
  JOIN clients c ON c.id = a.client_id
  LEFT JOIN branches b ON b.id = a.branch_id
  JOIN crm_clients cc ON cc.client_id = c.id
  WHERE ao.status = 'OPEN'
    AND COALESCE(ao.risk,'') IN ('CRITICAL','HIGH')
)
SELECT * FROM (
  SELECT * FROM overdue_tasks
  UNION ALL SELECT * FROM expired_docs
  UNION ALL SELECT * FROM high_risk_obs
) combined
ORDER BY days_overdue DESC NULLS LAST
LIMIT $2;
`;

/**
 * Top Risk Clients (top 10)
 * $1 = crmUserId, $2 = limit
 */
export const CRM_TOP_RISK_CLIENTS_SQL = `
WITH crm_clients AS (
  SELECT ca.client_id
  FROM client_assignments_current ca
  WHERE ca.assignment_type = 'CRM'
    AND ca.assigned_to_user_id = $1::uuid
)
SELECT
  c.id              AS client_id,
  c.client_name,
  CASE WHEN COUNT(ct.id) FILTER (WHERE ct.due_date IS NOT NULL) = 0 THEN 0
       ELSE ROUND(100.0 * COUNT(ct.id) FILTER (WHERE ct.status = 'COMPLETED')
                  / NULLIF(COUNT(ct.id) FILTER (WHERE ct.due_date IS NOT NULL), 0))::int
  END AS compliance_pct,
  (SELECT COUNT(*) FROM contractor_documents cd2
   WHERE cd2.client_id = c.id AND cd2.status IN ('UPLOADED','PENDING_REVIEW'))  AS pending_count,
  (SELECT COUNT(*) FROM contractor_documents cd3
   WHERE cd3.client_id = c.id AND cd3.status = 'REJECTED')                     AS reupload_count,
  (SELECT COUNT(*) FROM audit_observations ao2
   JOIN audits a2 ON a2.id = ao2.audit_id
   WHERE a2.client_id = c.id AND ao2.status = 'OPEN')                          AS open_observations,
  (SELECT COUNT(*) FROM contractor_documents cd4
   WHERE cd4.client_id = c.id
     AND cd4.expiry_date IS NOT NULL
     AND cd4.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + interval '30 days') AS expiring_count
FROM crm_clients cc
JOIN clients c ON c.id = cc.client_id
LEFT JOIN branches b ON b.client_id = c.id AND b.is_active = TRUE
LEFT JOIN compliance_tasks ct ON ct.branch_id = b.id
GROUP BY c.id, c.client_name
ORDER BY compliance_pct ASC, open_observations DESC
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
  b.branch_name,
  u.name            AS auditor_name,
  a.due_date,
  a.status,
  (a.due_date - CURRENT_DATE) AS days_until
FROM audits a
JOIN clients c ON c.id = a.client_id
JOIN crm_clients cc ON cc.client_id = c.id
LEFT JOIN branches b ON b.id = a.branch_id
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
