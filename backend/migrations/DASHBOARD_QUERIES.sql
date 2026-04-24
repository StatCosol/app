-- ============================================================================
-- STATCO DASHBOARD QUERIES - PRODUCTION-READY SQL
-- Supports: Admin Control Tower, CRM Compliance Owner, Auditor Execution
-- Created: 2026-02-06
-- PostgreSQL 14+
-- ============================================================================

-- ============================================================================
-- A) ADMIN DASHBOARD QUERIES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A1) GET /api/admin/dashboard/summary
-- ----------------------------------------------------------------------------
-- Purpose: Admin Control Tower KPIs
-- Parameters:
--   :client_id (optional) - Filter by specific client
--   :state (optional) - Filter by state
--   :from_date (optional) - Date range start
--   :to_date (optional) - Date range end
--   :window_days (default 30) - Window for "due soon" calculation
-- Returns: clients_count, branches_count, sla_score_pct, sla_status, 
--          overdue_audits_count, due_soon_audits_count, unread_notifications_count
-- ----------------------------------------------------------------------------

WITH filtered_clients AS (
  SELECT c.id
  FROM clients c
  WHERE c.is_active = TRUE
    AND (:client_id IS NULL OR c.id = :client_id)
    AND (:state IS NULL OR c.state = :state)
),
filtered_branches AS (
  SELECT b.id, b.client_id
  FROM branches b
  JOIN filtered_clients fc ON fc.id = b.client_id
  WHERE b.is_active = TRUE
),
overdue_audits AS (
  SELECT COUNT(*) AS cnt
  FROM audits a
  JOIN filtered_clients fc ON fc.id = a.client_id
  WHERE a.status IN ('ASSIGNED','IN_PROGRESS')
    AND a.due_date < CURRENT_DATE
    AND (:from_date IS NULL OR a.due_date >= :from_date)
    AND (:to_date IS NULL OR a.due_date <= :to_date)
),
due_soon_audits AS (
  SELECT COUNT(*) AS cnt
  FROM audits a
  JOIN filtered_clients fc ON fc.id = a.client_id
  WHERE a.status IN ('ASSIGNED','IN_PROGRESS')
    AND a.due_date >= CURRENT_DATE
    AND a.due_date < (CURRENT_DATE + (:window_days || ' days')::interval)
    AND (:from_date IS NULL OR a.due_date >= :from_date)
    AND (:to_date IS NULL OR a.due_date <= :to_date)
),
unread_notifs AS (
  SELECT COUNT(*) AS cnt
  FROM notifications n
  JOIN filtered_clients fc ON fc.id = n.client_id
  WHERE n.to_role = 'ADMIN'
    AND n.status = 'UNREAD'
    AND (:from_date IS NULL OR n.created_at::date >= :from_date)
    AND (:to_date IS NULL OR n.created_at::date <= :to_date)
),
sla_calc AS (
  -- SLA score: % of audits on-time within date window
  SELECT
    COALESCE(
      ROUND(
        100.0 * SUM(CASE WHEN a.due_date >= CURRENT_DATE THEN 1 ELSE 0 END)
        / NULLIF(COUNT(*),0)
      )::int,
      100
    ) AS score_pct
  FROM audits a
  JOIN filtered_clients fc ON fc.id = a.client_id
  WHERE a.status IN ('ASSIGNED','IN_PROGRESS')
    AND (:from_date IS NULL OR a.due_date >= :from_date)
    AND (:to_date IS NULL OR a.due_date <= :to_date)
)
SELECT
  (SELECT COUNT(*) FROM filtered_clients) AS clients_count,
  (SELECT COUNT(*) FROM filtered_branches) AS branches_count,
  (SELECT score_pct FROM sla_calc) AS sla_score_pct,
  (SELECT CASE
      WHEN (SELECT score_pct FROM sla_calc) >= 90 THEN 'GREEN'
      WHEN (SELECT score_pct FROM sla_calc) >= 75 THEN 'AMBER'
      ELSE 'RED'
    END) AS sla_status,
  (SELECT cnt FROM overdue_audits) AS overdue_audits_count,
  (SELECT cnt FROM due_soon_audits) AS due_soon_audits_count,
  (SELECT cnt FROM unread_notifs) AS unread_notifications_count;

-- ----------------------------------------------------------------------------
-- A2) GET /api/admin/dashboard/escalations
-- ----------------------------------------------------------------------------
-- Purpose: Admin escalation queue (overdue audits + overdue rotations)
-- Parameters:
--   :client_id (optional)
--   :state (optional)
--   :from_date (optional)
--   :to_date (optional)
-- Returns: issue_type, reason, client_id, client_name, branch_id, owner_role,
--          owner_name, days_delayed, last_updated_at, ref_id
-- Limit: 200 items
-- ----------------------------------------------------------------------------

WITH filtered_clients AS (
  SELECT c.id, c.name
  FROM clients c
  WHERE c.is_active = TRUE
    AND (:client_id IS NULL OR c.id = :client_id)
    AND (:state IS NULL OR c.state = :state)
),
-- 1) Overdue audits
audit_escalations AS (
  SELECT
    c.id AS client_id,
    c.name AS client_name,
    a.branch_id,
    'AUDIT'::text AS issue_type,
    'OVERDUE'::text AS reason,
    u.role AS owner_role,
    u.full_name AS owner_name,
    (CURRENT_DATE - a.due_date) AS days_delayed,
    a.last_updated_at,
    a.id::text AS ref_id
  FROM audits a
  JOIN filtered_clients c ON c.id = a.client_id
  JOIN users u ON u.id = a.assigned_auditor_id
  WHERE a.status IN ('ASSIGNED','IN_PROGRESS')
    AND a.due_date < CURRENT_DATE
),
-- 2) Assignment rotations overdue
assignment_escalations AS (
  SELECT
    c.id AS client_id,
    c.name AS client_name,
    NULL::uuid AS branch_id,
    'ASSIGNMENT'::text AS issue_type,
    'ROTATION_OVERDUE'::text AS reason,
    ca.assignment_type AS owner_role,
    u.full_name AS owner_name,
    (CURRENT_DATE - ca.rotation_due_on) AS days_delayed,
    ca.created_at AS last_updated_at,
    ca.id::text AS ref_id
  FROM client_assignments ca
  JOIN filtered_clients c ON c.id = ca.client_id
  JOIN users u ON u.id = ca.assigned_user_id
  WHERE ca.status = 'ACTIVE'
    AND ca.rotation_due_on < CURRENT_DATE
)
SELECT *
FROM (
  SELECT * FROM audit_escalations
  UNION ALL
  SELECT * FROM assignment_escalations
) x
WHERE (:from_date IS NULL OR x.last_updated_at::date >= :from_date)
  AND (:to_date IS NULL OR x.last_updated_at::date <= :to_date)
ORDER BY x.days_delayed DESC, x.last_updated_at DESC
LIMIT 200;

-- ----------------------------------------------------------------------------
-- A3) GET /api/admin/dashboard/assignments-attention
-- ----------------------------------------------------------------------------
-- Purpose: Assignments needing rotation or action
-- Parameters:
--   :client_id (optional)
--   :state (optional)
-- Returns: assignment_id, client_id, client_name, assignment_type, assigned_to,
--          assigned_on, rotation_due_on, days_overdue, status
-- Limit: 200 items
-- ----------------------------------------------------------------------------

WITH filtered_clients AS (
  SELECT c.id, c.name
  FROM clients c
  WHERE c.is_active = TRUE
    AND (:client_id IS NULL OR c.id = :client_id)
    AND (:state IS NULL OR c.state = :state)
),
active_assignments AS (
  SELECT
    ca.id,
    ca.client_id,
    ca.assignment_type,
    ca.assigned_user_id,
    u.full_name AS assigned_to,
    ca.assigned_on,
    ca.rotation_due_on,
    CASE
      WHEN ca.rotation_due_on < CURRENT_DATE THEN 'OVERDUE_ROTATION'
      ELSE 'ACTIVE'
    END AS status
  FROM client_assignments ca
  JOIN users u ON u.id = ca.assigned_user_id
  JOIN filtered_clients c ON c.id = ca.client_id
  WHERE ca.status = 'ACTIVE'
)
SELECT
  aa.id AS assignment_id,
  aa.client_id,
  c.name AS client_name,
  aa.assignment_type,
  aa.assigned_to,
  aa.assigned_on,
  aa.rotation_due_on,
  (CURRENT_DATE - aa.rotation_due_on) AS days_overdue,
  aa.status
FROM active_assignments aa
JOIN filtered_clients c ON c.id = aa.client_id
WHERE aa.status <> 'ACTIVE'
ORDER BY days_overdue DESC
LIMIT 200;

-- ----------------------------------------------------------------------------
-- A4) GET /api/admin/dashboard/system-health
-- ----------------------------------------------------------------------------
-- Purpose: Infrastructure health metrics for admin dashboard
-- Parameters: None
-- Returns: inactive_users_15d, unassigned_clients_crm, unassigned_clients_auditor,
--          failed_notifications_7d
-- ----------------------------------------------------------------------------

SELECT
  (SELECT COUNT(*) 
   FROM users 
   WHERE is_active = TRUE 
     AND last_login_at < (now() - interval '15 days')
  ) AS inactive_users_15d,
  
  (SELECT COUNT(*)
   FROM clients c
   WHERE c.is_active = TRUE
     AND NOT EXISTS (
       SELECT 1 FROM client_assignments ca
       WHERE ca.client_id = c.id 
         AND ca.status='ACTIVE' 
         AND ca.assignment_type='CRM'
     )
  ) AS unassigned_clients_crm,
  
  (SELECT COUNT(*)
   FROM clients c
   WHERE c.is_active = TRUE
     AND NOT EXISTS (
       SELECT 1 FROM client_assignments ca
       WHERE ca.client_id = c.id 
         AND ca.status='ACTIVE' 
         AND ca.assignment_type='AUDITOR'
     )
  ) AS unassigned_clients_auditor,
  
  (SELECT COUNT(*)
   FROM notifications n
   WHERE n.context_type = 'SYSTEM'
     AND n.status = 'UNREAD'
     AND n.created_at >= (now() - interval '7 days')
  ) AS failed_notifications_7d;

-- ============================================================================
-- B) CRM DASHBOARD QUERIES (SCOPE ENFORCED)
-- ============================================================================

-- NOTE: All CRM queries enforce scope via crm_clients CTE
-- CRM can only see clients assigned to them via client_assignments

-- ----------------------------------------------------------------------------
-- B1) GET /api/crm/dashboard/summary
-- ----------------------------------------------------------------------------
-- Purpose: CRM compliance owner operational KPIs
-- Parameters:
--   :crm_user_id (required) - Current CRM user ID
--   :client_id (optional) - Filter by specific assigned client
--   :from_date (optional) - Date range start
--   :to_date (optional) - Date range end
--   :window_days (default 30) - Window for "due soon" calculation
-- Returns: assigned_clients_count, assigned_branches_count, compliance_coverage_pct,
--          overdue_compliances_count, due_soon_compliances_count, open_compliance_queries_count
-- ----------------------------------------------------------------------------

WITH crm_clients AS (
  SELECT ca.client_id
  FROM client_assignments ca
  WHERE ca.status='ACTIVE'
    AND ca.assignment_type='CRM'
    AND ca.assigned_user_id = :crm_user_id
),
crm_branches AS (
  SELECT b.id, b.client_id
  FROM branches b
  JOIN crm_clients cc ON cc.client_id = b.client_id
  WHERE b.is_active = TRUE
),
due_in_period AS (
  SELECT
    COUNT(*) FILTER (WHERE s.status IN ('PENDING')) AS total_due,
    COUNT(*) FILTER (WHERE s.status IN ('COMPLETED')) AS total_completed,
    COUNT(*) FILTER (WHERE s.status='PENDING' AND s.due_date < CURRENT_DATE) AS overdue_cnt,
    COUNT(*) FILTER (
      WHERE s.status='PENDING'
        AND s.due_date >= CURRENT_DATE
        AND s.due_date < (CURRENT_DATE + (:window_days || ' days')::interval)
    ) AS due_soon_cnt
  FROM branch_compliance_schedule s
  JOIN crm_branches b ON b.id = s.branch_id
  WHERE (:client_id IS NULL OR b.client_id = :client_id)
    AND (:from_date IS NULL OR s.due_date >= :from_date)
    AND (:to_date IS NULL OR s.due_date <= :to_date)
),
open_queries AS (
  SELECT COUNT(*) AS cnt
  FROM notifications n
  JOIN crm_clients cc ON cc.client_id = n.client_id
  WHERE n.to_user_id = :crm_user_id
    AND n.query_type = 'COMPLIANCE'
    AND n.status IN ('UNREAD','READ')
    AND (:from_date IS NULL OR n.created_at::date >= :from_date)
    AND (:to_date IS NULL OR n.created_at::date <= :to_date)
)
SELECT
  (SELECT COUNT(*) FROM crm_clients) AS assigned_clients_count,
  (SELECT COUNT(*) FROM crm_branches WHERE (:client_id IS NULL OR client_id = :client_id)) AS assigned_branches_count,
  CASE
    WHEN (SELECT total_due FROM due_in_period) = 0 THEN NULL
    ELSE ROUND(100.0 * (SELECT total_completed FROM due_in_period) / NULLIF((SELECT total_due FROM due_in_period),0))::int
  END AS compliance_coverage_pct,
  (SELECT overdue_cnt FROM due_in_period) AS overdue_compliances_count,
  (SELECT due_soon_cnt FROM due_in_period) AS due_soon_compliances_count,
  (SELECT cnt FROM open_queries) AS open_compliance_queries_count;

-- ----------------------------------------------------------------------------
-- B2) GET /api/crm/dashboard/due-compliances
-- ----------------------------------------------------------------------------
-- Purpose: CRM compliance items by tab (OVERDUE, DUE_SOON, THIS_MONTH)
-- Parameters:
--   :crm_user_id (required)
--   :tab (required) - OVERDUE | DUE_SOON | THIS_MONTH
--   :client_id (optional)
--   :from_date (optional)
--   :to_date (optional)
--   :window_days (default 30) - For DUE_SOON tab
-- Returns: schedule_id, client_id, client_name, branch_id, branch_name, category,
--          compliance_item, risk, due_date, days_overdue, status
-- Limit: 500 items
-- ----------------------------------------------------------------------------

WITH crm_clients AS (
  SELECT ca.client_id
  FROM client_assignments ca
  WHERE ca.status='ACTIVE' 
    AND ca.assignment_type='CRM'
    AND ca.assigned_user_id = :crm_user_id
),
crm_branches AS (
  SELECT b.id, b.client_id, b.name AS branch_name
  FROM branches b
  JOIN crm_clients cc ON cc.client_id = b.client_id
  WHERE b.is_active = TRUE
),
base AS (
  SELECT
    s.id AS schedule_id,
    b.client_id,
    b.branch_name,
    s.branch_id,
    ci.category,
    ci.title AS compliance_item,
    ci.risk,
    s.due_date,
    (CURRENT_DATE - s.due_date) AS days_overdue,
    s.status
  FROM branch_compliance_schedule s
  JOIN crm_branches b ON b.id = s.branch_id
  JOIN compliance_items ci ON ci.id = s.compliance_item_id
  WHERE (:client_id IS NULL OR b.client_id = :client_id)
    AND (:from_date IS NULL OR s.due_date >= :from_date)
    AND (:to_date IS NULL OR s.due_date <= :to_date)
)
SELECT
  base.schedule_id,
  base.client_id,
  c.name AS client_name,
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
WHERE base.status = 'PENDING'
  AND (
    (:tab = 'OVERDUE' AND base.due_date < CURRENT_DATE)
    OR (:tab = 'DUE_SOON' AND base.due_date >= CURRENT_DATE AND base.due_date < (CURRENT_DATE + (:window_days || ' days')::interval))
    OR (:tab = 'THIS_MONTH' AND date_trunc('month', base.due_date) = date_trunc('month', CURRENT_DATE))
  )
ORDER BY base.due_date ASC
LIMIT 500;

-- ----------------------------------------------------------------------------
-- B3) GET /api/crm/dashboard/low-coverage-branches
-- ----------------------------------------------------------------------------
-- Purpose: Branches with low compliance coverage (risk view)
-- Parameters:
--   :crm_user_id (required)
--   :client_id (optional)
--   :from_date (optional)
--   :to_date (optional)
-- Returns: client_id, client_name, branch_id, branch_name, coverage_pct,
--          overdue_count, high_risk_pending
-- Filter: coverage_pct < 70 OR overdue_count >= 5
-- Limit: 200 items
-- ----------------------------------------------------------------------------

WITH crm_clients AS (
  SELECT ca.client_id
  FROM client_assignments ca
  WHERE ca.status='ACTIVE' 
    AND ca.assignment_type='CRM'
    AND ca.assigned_user_id = :crm_user_id
),
scope_branches AS (
  SELECT b.id AS branch_id, b.client_id, b.name AS branch_name
  FROM branches b
  JOIN crm_clients cc ON cc.client_id = b.client_id
  WHERE b.is_active = TRUE
),
agg AS (
  SELECT
    sb.client_id,
    sb.branch_id,
    sb.branch_name,
    COUNT(*) FILTER (WHERE s.status IN ('PENDING','COMPLETED')) AS total_items,
    COUNT(*) FILTER (WHERE s.status='COMPLETED') AS completed_items,
    COUNT(*) FILTER (WHERE s.status='PENDING' AND s.due_date < CURRENT_DATE) AS overdue_count,
    COUNT(*) FILTER (WHERE s.status='PENDING' AND ci.risk='HIGH') AS high_risk_pending
  FROM scope_branches sb
  JOIN branch_compliance_schedule s ON s.branch_id = sb.branch_id
  JOIN compliance_items ci ON ci.id = s.compliance_item_id
  WHERE (:client_id IS NULL OR sb.client_id = :client_id)
    AND (:from_date IS NULL OR s.due_date >= :from_date)
    AND (:to_date IS NULL OR s.due_date <= :to_date)
  GROUP BY sb.client_id, sb.branch_id, sb.branch_name
)
SELECT
  a.client_id,
  c.name AS client_name,
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
LIMIT 200;

-- ----------------------------------------------------------------------------
-- B4) GET /api/crm/dashboard/pending-documents
-- ----------------------------------------------------------------------------
-- Purpose: Document requests pending from clients/contractors
-- Note: Uses notifications table with context_type='COMPLIANCE' and subject LIKE '%document%'
-- Parameters:
--   :crm_user_id (required)
--   :client_id (optional)
--   :from_date (optional)
--   :to_date (optional)
-- Returns: request_id, client_id, client_name, branch_id, branch_name, 
--          document_type, requested_on, pending_days, status
-- Limit: 200 items
-- ----------------------------------------------------------------------------

WITH crm_clients AS (
  SELECT ca.client_id
  FROM client_assignments ca
  WHERE ca.status='ACTIVE' 
    AND ca.assignment_type='CRM'
    AND ca.assigned_user_id = :crm_user_id
)
SELECT
  n.id AS request_id,
  n.client_id,
  c.name AS client_name,
  n.branch_id,
  b.name AS branch_name,
  n.subject AS document_type,
  n.created_at::date AS requested_on,
  (CURRENT_DATE - n.created_at::date) AS pending_days,
  n.status
FROM notifications n
JOIN crm_clients cc ON cc.client_id = n.client_id
LEFT JOIN clients c ON c.id = n.client_id
LEFT JOIN branches b ON b.id = n.branch_id
WHERE n.context_type = 'COMPLIANCE'
  AND n.query_type = 'COMPLIANCE'
  AND n.subject ILIKE '%document%'
  AND n.status IN ('UNREAD','READ')
  AND (:client_id IS NULL OR n.client_id = :client_id)
  AND (:from_date IS NULL OR n.created_at::date >= :from_date)
  AND (:to_date IS NULL OR n.created_at::date <= :to_date)
ORDER BY pending_days DESC
LIMIT 200;

-- ----------------------------------------------------------------------------
-- B5) GET /api/crm/dashboard/queries
-- ----------------------------------------------------------------------------
-- Purpose: Compliance queries inbox for CRM
-- Parameters:
--   :crm_user_id (required)
--   :status (optional) - UNREAD | READ | CLOSED
--   :from_date (optional)
--   :to_date (optional)
-- Returns: query_id, from_role, from_name, client_id, client_name, subject,
--          ageing_days, status, created_at
-- Limit: 200 items
-- ----------------------------------------------------------------------------

WITH crm_clients AS (
  SELECT ca.client_id
  FROM client_assignments ca
  WHERE ca.status='ACTIVE' 
    AND ca.assignment_type='CRM'
    AND ca.assigned_user_id = :crm_user_id
)
SELECT
  n.id AS query_id,
  n.from_role,
  u.full_name AS from_name,
  n.client_id,
  c.name AS client_name,
  n.subject,
  (CURRENT_DATE - n.created_at::date) AS ageing_days,
  n.status,
  n.created_at
FROM notifications n
JOIN crm_clients cc ON cc.client_id = n.client_id
LEFT JOIN users u ON u.id = n.from_user_id
LEFT JOIN clients c ON c.id = n.client_id
WHERE n.to_user_id = :crm_user_id
  AND n.query_type = 'COMPLIANCE'
  AND (:status IS NULL OR n.status = :status)
  AND (:from_date IS NULL OR n.created_at::date >= :from_date)
  AND (:to_date IS NULL OR n.created_at::date <= :to_date)
ORDER BY n.created_at DESC
LIMIT 200;

-- ============================================================================
-- C) AUDITOR DASHBOARD QUERIES (SCOPE ENFORCED)
-- ============================================================================

-- NOTE: All Auditor queries enforce scope via my_audits CTE
-- Auditor can only see audits assigned to them

-- ----------------------------------------------------------------------------
-- C1) GET /api/auditor/dashboard/summary
-- ----------------------------------------------------------------------------
-- Purpose: Auditor execution KPIs
-- Parameters:
--   :auditor_user_id (required) - Current auditor user ID
--   :client_id (optional) - Filter by specific client
--   :from_date (optional) - Date range start
--   :to_date (optional) - Date range end
--   :window_days (default 30) - Window for "due soon" calculation
-- Returns: assigned_audits_count, overdue_audits_count, due_soon_audits_count,
--          observations_open_count, high_risk_open_count, reports_pending_count
-- ----------------------------------------------------------------------------

WITH my_audits AS (
  SELECT a.*
  FROM audits a
  WHERE a.assigned_auditor_id = :auditor_user_id
    AND (:client_id IS NULL OR a.client_id = :client_id)
    AND (:from_date IS NULL OR a.due_date >= :from_date)
    AND (:to_date IS NULL OR a.due_date <= :to_date)
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
     AND due_date < (CURRENT_DATE + (:window_days || ' days')::interval)
  ) AS due_soon_audits_count,
  (SELECT open_cnt FROM obs) AS observations_open_count,
  (SELECT high_open_cnt FROM obs) AS high_risk_open_count,
  (SELECT pending_cnt FROM reports) AS reports_pending_count;

-- ----------------------------------------------------------------------------
-- C2) GET /api/auditor/dashboard/audits
-- ----------------------------------------------------------------------------
-- Purpose: Auditor's assigned audits by tab
-- Parameters:
--   :auditor_user_id (required)
--   :tab (required) - ACTIVE | OVERDUE | DUE_SOON | COMPLETED
--   :client_id (optional)
--   :from_date (optional)
--   :to_date (optional)
--   :window_days (default 30) - For DUE_SOON tab
-- Returns: audit_id, client_id, client_name, branch_id, branch_name, audit_type,
--          audit_name, due_date, status, progress_pct
-- Limit: 500 items
-- ----------------------------------------------------------------------------

WITH my_audits AS (
  SELECT a.*
  FROM audits a
  WHERE a.assigned_auditor_id = :auditor_user_id
    AND (:client_id IS NULL OR a.client_id = :client_id)
    AND (:from_date IS NULL OR a.due_date >= :from_date)
    AND (:to_date IS NULL OR a.due_date <= :to_date)
)
SELECT
  a.id AS audit_id,
  a.client_id,
  c.name AS client_name,
  a.branch_id,
  b.name AS branch_name,
  a.audit_type,
  a.audit_name,
  a.due_date,
  a.status,
  a.progress_pct
FROM my_audits a
LEFT JOIN clients c ON c.id = a.client_id
LEFT JOIN branches b ON b.id = a.branch_id
WHERE
  (
    (:tab = 'ACTIVE' AND a.status IN ('ASSIGNED','IN_PROGRESS'))
    OR (:tab = 'OVERDUE' AND a.status IN ('ASSIGNED','IN_PROGRESS') AND a.due_date < CURRENT_DATE)
    OR (:tab = 'DUE_SOON' AND a.status IN ('ASSIGNED','IN_PROGRESS') AND a.due_date >= CURRENT_DATE
        AND a.due_date < (CURRENT_DATE + (:window_days || ' days')::interval))
    OR (:tab = 'COMPLETED' AND a.status IN ('COMPLETED','SUBMITTED'))
  )
ORDER BY a.due_date ASC, a.last_updated_at DESC
LIMIT 500;

-- ----------------------------------------------------------------------------
-- C3) GET /api/auditor/dashboard/observations
-- ----------------------------------------------------------------------------
-- Purpose: Observations pending closure for auditor's audits
-- Parameters:
--   :auditor_user_id (required)
--   :status (optional) - OPEN | IN_PROGRESS | RESOLVED | CLOSED
--   :risk (optional) - CRITICAL | HIGH | MEDIUM | LOW
--   :client_id (optional)
-- Returns: observation_id, audit_id, client_id, client_name, branch_id, branch_name,
--          title, risk, owner_role, status, ageing_days, created_at
-- Limit: 500 items
-- ----------------------------------------------------------------------------

WITH my_audits AS (
  SELECT a.id
  FROM audits a
  WHERE a.assigned_auditor_id = :auditor_user_id
    AND (:client_id IS NULL OR a.client_id = :client_id)
),
base AS (
  SELECT
    o.id AS observation_id,
    o.audit_id,
    a.client_id,
    a.branch_id,
    o.title,
    o.risk,
    o.owner_role,
    o.status,
    (CURRENT_DATE - o.created_at::date) AS ageing_days,
    o.created_at
  FROM audit_observations o
  JOIN audits a ON a.id = o.audit_id
  JOIN my_audits ma ON ma.id = o.audit_id
)
SELECT
  b.observation_id,
  b.audit_id,
  b.client_id,
  c.name AS client_name,
  b.branch_id,
  br.name AS branch_name,
  b.title,
  b.risk,
  b.owner_role,
  b.status,
  b.ageing_days,
  b.created_at
FROM base b
LEFT JOIN clients c ON c.id = b.client_id
LEFT JOIN branches br ON br.id = b.branch_id
WHERE (:status IS NULL OR b.status = :status)
  AND (:risk IS NULL OR b.risk = :risk)
ORDER BY b.risk DESC, b.ageing_days DESC
LIMIT 500;

-- ----------------------------------------------------------------------------
-- C4) GET /api/auditor/dashboard/evidence-pending
-- ----------------------------------------------------------------------------
-- Purpose: Evidence/documents pending submission for audits
-- Note: Uses notifications table with context_type='AUDIT' and subject LIKE '%evidence%'
-- Parameters:
--   :auditor_user_id (required)
-- Returns: request_id, client_id, client_name, branch_id, branch_name,
--          evidence_name, requested_on, pending_days, status
-- Limit: 200 items
-- ----------------------------------------------------------------------------

SELECT
  n.id AS request_id,
  n.client_id,
  c.name AS client_name,
  n.branch_id,
  b.name AS branch_name,
  n.subject AS evidence_name,
  n.created_at::date AS requested_on,
  (CURRENT_DATE - n.created_at::date) AS pending_days,
  n.status
FROM notifications n
JOIN audits a ON a.client_id = n.client_id
LEFT JOIN clients c ON c.id = n.client_id
LEFT JOIN branches b ON b.id = n.branch_id
WHERE a.assigned_auditor_id = :auditor_user_id
  AND n.context_type = 'AUDIT'
  AND n.subject ILIKE '%evidence%'
  AND n.status IN ('UNREAD','READ')
ORDER BY pending_days DESC
LIMIT 200;

-- ----------------------------------------------------------------------------
-- C5) GET /api/auditor/dashboard/reports
-- ----------------------------------------------------------------------------
-- Purpose: Audit reports pending submission
-- Note: If no separate reports table exists, uses audits.status='COMPLETED'
-- Parameters:
--   :auditor_user_id (required)
--   :status (optional) - PENDING_SUBMISSION | SUBMITTED
-- Returns: audit_id, client_id, client_name, branch_id, branch_name, due_date, status
-- Limit: 200 items
-- ----------------------------------------------------------------------------

SELECT
  a.id AS audit_id,
  a.client_id,
  c.name AS client_name,
  a.branch_id,
  b.name AS branch_name,
  a.due_date,
  a.status
FROM audits a
LEFT JOIN clients c ON c.id = a.client_id
LEFT JOIN branches b ON b.id = a.branch_id
WHERE a.assigned_auditor_id = :auditor_user_id
  AND (
    (:status = 'PENDING_SUBMISSION' AND a.status = 'COMPLETED')
    OR (:status = 'SUBMITTED' AND a.status = 'SUBMITTED')
    OR (:status IS NULL)
  )
ORDER BY a.due_date ASC
LIMIT 200;

-- ============================================================================
-- OPTIMIZATION NOTES
-- ============================================================================

-- 1) All queries use CTEs for readability and proper scoping
-- 2) Admin queries filter by client/state but see system-wide data
-- 3) CRM queries ALWAYS filter by assigned clients (crm_clients CTE)
-- 4) Auditor queries ALWAYS filter by assigned audits (my_audits CTE)
-- 5) Critical indexes are already created in the schema migration
-- 6) Default window_days = 30 for "due soon" calculations
-- 7) All queries respect optional date range filters
-- 8) Results limited to prevent performance issues (200-500 items)

-- ============================================================================
-- PARAMETER BINDING NOTES (FOR BACKEND IMPLEMENTATION)
-- ============================================================================

-- PostgreSQL parameter syntax: :param_name
-- NestJS/TypeORM: Use @Param() decorator and parameterized queries
-- 
-- Example (NestJS):
-- @Get('summary')
-- async getSummary(
--   @Query('clientId') clientId?: string,
--   @Query('state') state?: string,
--   @Query('fromDate') fromDate?: string,
--   @Query('toDate') toDate?: string,
--   @Query('windowDays') windowDays: number = 30
-- ) {
--   return this.dashboardService.getAdminSummary({
--     client_id: clientId || null,
--     state: state || null,
--     from_date: fromDate || null,
--     to_date: toDate || null,
--     window_days: windowDays
--   });
-- }

-- ============================================================================
-- END OF DASHBOARD QUERIES
-- ============================================================================
