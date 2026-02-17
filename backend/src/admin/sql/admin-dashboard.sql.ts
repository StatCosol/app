/**
 * Admin Dashboard SQL Queries
 * Raw SQL optimized for dashboard performance
 * Uses positional parameters ($1, $2, etc.) for PostgreSQL
 */

/**
 * A1) GET /api/admin/dashboard/summary
 * Parameters: $1=clientId, $2=state, $3=fromDate, $4=toDate, $5=windowDays
 */
export const ADMIN_DASHBOARD_SUMMARY_SQL = `
WITH state_filter AS (
  SELECT CASE
    WHEN $2::text IS NULL THEN NULL
    ELSE (
      WITH x AS (
        SELECT REPLACE(TRIM(BOTH FROM UPPER($2::text)), ' ', '') AS r
      )
      SELECT CASE
        WHEN r IN ('TG','TS','TELANGANA','TELANGANASTATE') THEN 'TS'
        WHEN r IN ('AP','ANDHRAPRADESH','ANDHRA') THEN 'AP'
        WHEN r IN ('TN','TAMILNADU','TAMILNADUSTATE','TAMILNADUSTATE') THEN 'TN'
        WHEN r IN ('KA','KARNATAKA') THEN 'KA'
        WHEN r IN ('MH','MAHARASHTRA') THEN 'MH'
        WHEN r IN ('GJ','GUJARAT') THEN 'GJ'
        WHEN r IN ('KL','KERALA') THEN 'KL'
        WHEN r IN ('DL','DELHI','NEWDELHI','NCR') THEN 'DL'
        WHEN r IN ('RJ','RAJASTHAN') THEN 'RJ'
        WHEN r IN ('UP','UTTARPRADESH') THEN 'UP'
        WHEN r IN ('MP','MADHYAPRADESH') THEN 'MP'
        WHEN r IN ('WB','WESTBENGAL') THEN 'WB'
        WHEN r IN ('OD','OR','ORISSA','ODISHA') THEN 'OD'
        WHEN r IN ('HR','HARYANA') THEN 'HR'
        WHEN r IN ('PB','PUNJAB') THEN 'PB'
        WHEN r IN ('BR','BIHAR') THEN 'BR'
        WHEN r IN ('JH','JHARKHAND') THEN 'JH'
        WHEN r IN ('CG','CT','CHHATTISGARH','CHHATTISGAR') THEN 'CG'
        WHEN r IN ('UK','UT','UTTARAKHAND','UTTARANCHAL') THEN 'UK'
        ELSE r
      END FROM x
    )
  END AS code
),
filtered_clients AS (
  SELECT c.id
  FROM clients c, state_filter sf
  WHERE c.is_active = TRUE
    AND ($1::uuid IS NULL OR c.id = $1)
    AND (
      sf.code IS NULL
      OR (
        CASE
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('TG','TS','TELANGANA','TELANGANASTATE') THEN 'TS'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('AP','ANDHRAPRADESH','ANDHRA') THEN 'AP'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('TN','TAMILNADU','TAMILNADUSTATE','TAMILNADUSTATE') THEN 'TN'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('KA','KARNATAKA') THEN 'KA'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('MH','MAHARASHTRA') THEN 'MH'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('GJ','GUJARAT') THEN 'GJ'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('KL','KERALA') THEN 'KL'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('DL','DELHI','NEWDELHI','NCR') THEN 'DL'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('RJ','RAJASTHAN') THEN 'RJ'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('UP','UTTARPRADESH') THEN 'UP'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('MP','MADHYAPRADESH') THEN 'MP'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('WB','WESTBENGAL') THEN 'WB'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('OD','OR','ORISSA','ODISHA') THEN 'OD'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('HR','HARYANA') THEN 'HR'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('PB','PUNJAB') THEN 'PB'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('BR','BIHAR') THEN 'BR'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('JH','JHARKHAND') THEN 'JH'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('CG','CT','CHHATTISGARH','CHHATTISGAR') THEN 'CG'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('UK','UT','UTTARAKHAND','UTTARANCHAL') THEN 'UK'
          ELSE REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '')
        END
      ) = sf.code
      OR EXISTS (
        SELECT 1 FROM client_branches cb
        WHERE cb.clientid = c.id
          AND cb.isactive = TRUE
          AND cb.isdeleted = FALSE
          AND (
            CASE
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('TG','TS','TELANGANA','TELANGANASTATE') THEN 'TS'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('AP','ANDHRAPRADESH','ANDHRA') THEN 'AP'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('TN','TAMILNADU','TAMILNADUSTATE','TAMILNADUSTATE') THEN 'TN'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('KA','KARNATAKA') THEN 'KA'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('MH','MAHARASHTRA') THEN 'MH'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('GJ','GUJARAT') THEN 'GJ'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('KL','KERALA') THEN 'KL'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('DL','DELHI','NEWDELHI','NCR') THEN 'DL'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('RJ','RAJASTHAN') THEN 'RJ'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('UP','UTTARPRADESH') THEN 'UP'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('MP','MADHYAPRADESH') THEN 'MP'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('WB','WESTBENGAL') THEN 'WB'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('OD','OR','ORISSA','ODISHA') THEN 'OD'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('HR','HARYANA') THEN 'HR'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('PB','PUNJAB') THEN 'PB'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('BR','BIHAR') THEN 'BR'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('JH','JHARKHAND') THEN 'JH'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('CG','CT','CHHATTISGARH','CHHATTISGAR') THEN 'CG'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('UK','UT','UTTARAKHAND','UTTARANCHAL') THEN 'UK'
              ELSE REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '')
            END
          ) = sf.code
      )
    )
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
    AND ($3::date IS NULL OR a.due_date >= $3)
    AND ($4::date IS NULL OR a.due_date <= $4)
),
due_soon_audits AS (
  SELECT COUNT(*) AS cnt
  FROM audits a
  JOIN filtered_clients fc ON fc.id = a.client_id
  WHERE a.status IN ('ASSIGNED','IN_PROGRESS')
    AND a.due_date >= CURRENT_DATE
    AND a.due_date < (CURRENT_DATE + ($5::int || ' days')::interval)
    AND ($3::date IS NULL OR a.due_date >= $3)
    AND ($4::date IS NULL OR a.due_date <= $4)
),
unread_notifs AS (
  SELECT COUNT(*) AS cnt
  FROM notifications n
  JOIN filtered_clients fc ON fc.id = n.client_id
  WHERE n.to_role = 'ADMIN'
    AND n.status = 'UNREAD'
    AND ($3::date IS NULL OR n.created_at::date >= $3)
    AND ($4::date IS NULL OR n.created_at::date <= $4)
),
sla_calc AS (
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
    AND ($3::date IS NULL OR a.due_date >= $3)
    AND ($4::date IS NULL OR a.due_date <= $4)
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
`;

/**
 * A2) GET /api/admin/dashboard/escalations
 * Parameters: $1=clientId, $2=state, $3=fromDate, $4=toDate
 */
export const ADMIN_ESCALATIONS_SQL = `
WITH state_filter AS (
  SELECT CASE
    WHEN $2::text IS NULL THEN NULL
    ELSE (
      WITH x AS (
        SELECT REPLACE(TRIM(BOTH FROM UPPER($2::text)), ' ', '') AS r
      )
      SELECT CASE
        WHEN r IN ('TG','TS','TELANGANA','TELANGANASTATE') THEN 'TS'
        WHEN r IN ('AP','ANDHRAPRADESH','ANDHRA') THEN 'AP'
        WHEN r IN ('TN','TAMILNADU','TAMILNADUSTATE','TAMILNADUSTATE') THEN 'TN'
        WHEN r IN ('KA','KARNATAKA') THEN 'KA'
        WHEN r IN ('MH','MAHARASHTRA') THEN 'MH'
        WHEN r IN ('GJ','GUJARAT') THEN 'GJ'
        WHEN r IN ('KL','KERALA') THEN 'KL'
        WHEN r IN ('DL','DELHI','NEWDELHI','NCR') THEN 'DL'
        WHEN r IN ('RJ','RAJASTHAN') THEN 'RJ'
        WHEN r IN ('UP','UTTARPRADESH') THEN 'UP'
        WHEN r IN ('MP','MADHYAPRADESH') THEN 'MP'
        WHEN r IN ('WB','WESTBENGAL') THEN 'WB'
        WHEN r IN ('OD','OR','ORISSA','ODISHA') THEN 'OD'
        WHEN r IN ('HR','HARYANA') THEN 'HR'
        WHEN r IN ('PB','PUNJAB') THEN 'PB'
        WHEN r IN ('BR','BIHAR') THEN 'BR'
        WHEN r IN ('JH','JHARKHAND') THEN 'JH'
        WHEN r IN ('CG','CT','CHHATTISGARH','CHHATTISGAR') THEN 'CG'
        WHEN r IN ('UK','UT','UTTARAKHAND','UTTARANCHAL') THEN 'UK'
        ELSE r
      END FROM x
    )
  END AS code
),
filtered_clients AS (
  SELECT c.id, c.client_name AS name
  FROM clients c, state_filter sf
  WHERE c.is_active = TRUE
    AND ($1::uuid IS NULL OR c.id = $1)
    AND (
      sf.code IS NULL
      OR (
        CASE
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('TG','TS','TELANGANA','TELANGANASTATE') THEN 'TS'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('AP','ANDHRAPRADESH','ANDHRA') THEN 'AP'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('TN','TAMILNADU','TAMILNADUSTATE','TAMILNADUSTATE') THEN 'TN'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('KA','KARNATAKA') THEN 'KA'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('MH','MAHARASHTRA') THEN 'MH'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('GJ','GUJARAT') THEN 'GJ'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('KL','KERALA') THEN 'KL'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('DL','DELHI','NEWDELHI','NCR') THEN 'DL'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('RJ','RAJASTHAN') THEN 'RJ'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('UP','UTTARPRADESH') THEN 'UP'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('MP','MADHYAPRADESH') THEN 'MP'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('WB','WESTBENGAL') THEN 'WB'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('OD','OR','ORISSA','ODISHA') THEN 'OD'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('HR','HARYANA') THEN 'HR'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('PB','PUNJAB') THEN 'PB'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('BR','BIHAR') THEN 'BR'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('JH','JHARKHAND') THEN 'JH'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('CG','CT','CHHATTISGARH','CHHATTISGAR') THEN 'CG'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('UK','UT','UTTARAKHAND','UTTARANCHAL') THEN 'UK'
          ELSE REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '')
        END
      ) = sf.code
      OR EXISTS (
        SELECT 1 FROM client_branches cb
        WHERE cb.clientid = c.id
          AND cb.isactive = TRUE
          AND cb.isdeleted = FALSE
          AND (
            CASE
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('TG','TS','TELANGANA','TELANGANASTATE') THEN 'TS'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('AP','ANDHRAPRADESH','ANDHRA') THEN 'AP'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('TN','TAMILNADU','TAMILNADUSTATE','TAMILNADUSTATE') THEN 'TN'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('KA','KARNATAKA') THEN 'KA'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('MH','MAHARASHTRA') THEN 'MH'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('GJ','GUJARAT') THEN 'GJ'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('KL','KERALA') THEN 'KL'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('DL','DELHI','NEWDELHI','NCR') THEN 'DL'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('RJ','RAJASTHAN') THEN 'RJ'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('UP','UTTARPRADESH') THEN 'UP'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('MP','MADHYAPRADESH') THEN 'MP'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('WB','WESTBENGAL') THEN 'WB'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('OD','OR','ORISSA','ODISHA') THEN 'OD'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('HR','HARYANA') THEN 'HR'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('PB','PUNJAB') THEN 'PB'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('BR','BIHAR') THEN 'BR'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('JH','JHARKHAND') THEN 'JH'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('CG','CT','CHHATTISGARH','CHHATTISGAR') THEN 'CG'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('UK','UT','UTTARAKHAND','UTTARANCHAL') THEN 'UK'
              ELSE REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '')
            END
          ) = sf.code
      )
    )
),
audit_escalations AS (
  SELECT
    c.id AS client_id,
    c.name AS client_name,
    a.branch_id,
    'AUDIT'::text AS issue_type,
    'OVERDUE'::text AS reason,
    u.role AS owner_role,
    u.name AS owner_name,
    (CURRENT_DATE - a.due_date) AS days_delayed,
    a.updated_at AS last_updated_at,
    a.id::text AS ref_id
  FROM audits a
  JOIN filtered_clients c ON c.id = a.client_id
  JOIN users u ON u.id = a.assigned_auditor_id
  WHERE a.status IN ('ASSIGNED','IN_PROGRESS')
    AND a.due_date < CURRENT_DATE
),
assignment_escalations AS (
  SELECT
    c.id AS client_id,
    c.name AS client_name,
    NULL::uuid AS branch_id,
    'ASSIGNMENT'::text AS issue_type,
    'ROTATION_OVERDUE'::text AS reason,
    ca.assignment_type AS owner_role,
    u.name AS owner_name,
    (CURRENT_DATE - ca.rotation_due_on) AS days_delayed,
    COALESCE(ca.updated_at, ca.created_at) AS last_updated_at,
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
WHERE ($3::date IS NULL OR x.last_updated_at::date >= $3)
  AND ($4::date IS NULL OR x.last_updated_at::date <= $4)
ORDER BY x.days_delayed DESC, x.last_updated_at DESC
LIMIT 200;
`;

/**
 * A3) GET /api/admin/dashboard/assignments-attention
 * Parameters: $1=clientId, $2=state
 */
export const ADMIN_ASSIGNMENTS_ATTENTION_SQL = `
WITH state_filter AS (
  SELECT CASE
    WHEN $2::text IS NULL THEN NULL
    ELSE (
      WITH x AS (
        SELECT REPLACE(TRIM(BOTH FROM UPPER($2::text)), ' ', '') AS r
      )
      SELECT CASE
        WHEN r IN ('TG','TS','TELANGANA','TELANGANASTATE') THEN 'TS'
        WHEN r IN ('AP','ANDHRAPRADESH','ANDHRA') THEN 'AP'
        WHEN r IN ('TN','TAMILNADU','TAMILNADUSTATE','TAMILNADUSTATE') THEN 'TN'
        WHEN r IN ('KA','KARNATAKA') THEN 'KA'
        WHEN r IN ('MH','MAHARASHTRA') THEN 'MH'
        WHEN r IN ('GJ','GUJARAT') THEN 'GJ'
        WHEN r IN ('KL','KERALA') THEN 'KL'
        WHEN r IN ('DL','DELHI','NEWDELHI','NCR') THEN 'DL'
        WHEN r IN ('RJ','RAJASTHAN') THEN 'RJ'
        WHEN r IN ('UP','UTTARPRADESH') THEN 'UP'
        WHEN r IN ('MP','MADHYAPRADESH') THEN 'MP'
        WHEN r IN ('WB','WESTBENGAL') THEN 'WB'
        WHEN r IN ('OD','OR','ORISSA','ODISHA') THEN 'OD'
        WHEN r IN ('HR','HARYANA') THEN 'HR'
        WHEN r IN ('PB','PUNJAB') THEN 'PB'
        WHEN r IN ('BR','BIHAR') THEN 'BR'
        WHEN r IN ('JH','JHARKHAND') THEN 'JH'
        WHEN r IN ('CG','CT','CHHATTISGARH','CHHATTISGAR') THEN 'CG'
        WHEN r IN ('UK','UT','UTTARAKHAND','UTTARANCHAL') THEN 'UK'
        ELSE r
      END FROM x
    )
  END AS code
),
filtered_clients AS (
  SELECT c.id, c.client_name AS name
  FROM clients c, state_filter sf
  WHERE c.is_active = TRUE
    AND ($1::uuid IS NULL OR c.id = $1)
    AND (
      sf.code IS NULL
      OR (
        CASE
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('TG','TS','TELANGANA','TELANGANASTATE') THEN 'TS'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('AP','ANDHRAPRADESH','ANDHRA') THEN 'AP'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('TN','TAMILNADU','TAMILNADUSTATE','TAMILNADUSTATE') THEN 'TN'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('KA','KARNATAKA') THEN 'KA'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('MH','MAHARASHTRA') THEN 'MH'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('GJ','GUJARAT') THEN 'GJ'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('KL','KERALA') THEN 'KL'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('DL','DELHI','NEWDELHI','NCR') THEN 'DL'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('RJ','RAJASTHAN') THEN 'RJ'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('UP','UTTARPRADESH') THEN 'UP'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('MP','MADHYAPRADESH') THEN 'MP'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('WB','WESTBENGAL') THEN 'WB'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('OD','OR','ORISSA','ODISHA') THEN 'OD'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('HR','HARYANA') THEN 'HR'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('PB','PUNJAB') THEN 'PB'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('BR','BIHAR') THEN 'BR'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('JH','JHARKHAND') THEN 'JH'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('CG','CT','CHHATTISGARH','CHHATTISGAR') THEN 'CG'
          WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '') IN ('UK','UT','UTTARAKHAND','UTTARANCHAL') THEN 'UK'
          ELSE REPLACE(TRIM(BOTH FROM UPPER(COALESCE(c.state, ''))), ' ', '')
        END
      ) = sf.code
      OR EXISTS (
        SELECT 1 FROM client_branches cb
        WHERE cb.clientid = c.id
          AND cb.isactive = TRUE
          AND cb.isdeleted = FALSE
          AND (
            CASE
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('TG','TS','TELANGANA','TELANGANASTATE') THEN 'TS'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('AP','ANDHRAPRADESH','ANDHRA') THEN 'AP'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('TN','TAMILNADU','TAMILNADUSTATE','TAMILNADUSTATE') THEN 'TN'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('KA','KARNATAKA') THEN 'KA'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('MH','MAHARASHTRA') THEN 'MH'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('GJ','GUJARAT') THEN 'GJ'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('KL','KERALA') THEN 'KL'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('DL','DELHI','NEWDELHI','NCR') THEN 'DL'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('RJ','RAJASTHAN') THEN 'RJ'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('UP','UTTARPRADESH') THEN 'UP'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('MP','MADHYAPRADESH') THEN 'MP'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('WB','WESTBENGAL') THEN 'WB'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('OD','OR','ORISSA','ODISHA') THEN 'OD'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('HR','HARYANA') THEN 'HR'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('PB','PUNJAB') THEN 'PB'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('BR','BIHAR') THEN 'BR'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('JH','JHARKHAND') THEN 'JH'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('CG','CT','CHHATTISGARH','CHHATTISGAR') THEN 'CG'
              WHEN REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '') IN ('UK','UT','UTTARAKHAND','UTTARANCHAL') THEN 'UK'
              ELSE REPLACE(TRIM(BOTH FROM UPPER(COALESCE(cb.statecode, ''))), ' ', '')
            END
          ) = sf.code
      )
    )
),
active_assignments AS (
  SELECT
    ca.id,
    ca.client_id,
    ca.assignment_type,
    ca.assigned_user_id,
    u.name AS assigned_to,
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
`;

/**
 * A4) GET /api/admin/dashboard/system-health
 * Parameters: None
 */
export const ADMIN_SYSTEM_HEALTH_SQL = `
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
`;
