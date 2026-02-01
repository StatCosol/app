const express = require('express');
const pool = require('../db'); // Adjust path if needed

const router = express.Router();

function getRange(req) {
  const r = (req.query.range || '30d').toString();
  return (r === '7d' || r === '90d' || r === '30d') ? r : '30d';
}

router.get('/stats', async (req, res) => {
  const range = getRange(req);
  const sql = `
    WITH range_start AS (
      SELECT NOW() - (
        CASE
          WHEN $1 = '7d' THEN INTERVAL '7 days'
          WHEN $1 = '90d' THEN INTERVAL '90 days'
          ELSE INTERVAL '30 days'
        END
      ) AS dt
    )
    SELECT
      (SELECT COUNT(*) FROM clients WHERE COALESCE("isActive", TRUE) = TRUE) AS clients,
      (SELECT COUNT(*) FROM client_branches WHERE COALESCE(status, 'ACTIVE') = 'ACTIVE') AS branches,
      (SELECT COUNT(*) FROM users WHERE COALESCE("isActive", TRUE) = TRUE) AS users,
      0 AS "openQueries",
      (SELECT COUNT(*) FROM compliance_tasks t WHERE t.status NOT IN ('COMPLETED','CLOSED') AND t.due_date < CURRENT_DATE) AS "overdueTasks",
      0 AS "slaBreaches",
      (SELECT COUNT(*) FROM approvals a WHERE a.status = 'PENDING') AS "pendingApprovals",
      0 AS "unreadNotifications"
  `;
  const { rows } = await pool.query(sql, [range]);
  res.json(rows[0]);
});

router.get('/crm-load', async (req, res) => {
  const sql = `
    SELECT
      u.id AS "userId",
      u.name AS "name",
      COUNT(DISTINCT a."clientId") AS "clientsAssigned",
      COALESCE(SUM(CASE WHEN t.status IN ('OPEN','PENDING','IN_PROGRESS') THEN 1 ELSE 0 END),0) AS "openItems",
      COALESCE(SUM(CASE WHEN t.status NOT IN ('COMPLETED','CLOSED') AND t.due_date < CURRENT_DATE THEN 1 ELSE 0 END),0) AS "overdue",
      0 AS "slaBreaches"
    FROM users u
    LEFT JOIN client_crm_assignments a ON a."crmId" = u.id AND COALESCE(a."isActive", TRUE) = TRUE
    LEFT JOIN compliance_tasks t ON t.client_id = a."clientId"
    WHERE u."roleId" = (SELECT id FROM roles WHERE name ILIKE 'CRM' LIMIT 1)
    GROUP BY u.id, u.name
    ORDER BY "clientsAssigned" DESC, "overdue" DESC;
  `;
  const { rows } = await pool.query(sql);
  res.json(rows);
});

router.get('/auditor-load', async (req, res) => {
  const sql = `
    SELECT
      u.id AS "userId",
      u.name AS "name",
      COUNT(DISTINCT a."clientId") AS "clientsAssigned",
      COALESCE(SUM(CASE WHEN t.status IN ('OPEN','PENDING','IN_PROGRESS') THEN 1 ELSE 0 END),0) AS "openItems",
      COALESCE(SUM(CASE WHEN t.status NOT IN ('COMPLETED','CLOSED') AND t.due_date < CURRENT_DATE THEN 1 ELSE 0 END),0) AS "overdue",
      0 AS "slaBreaches"
    FROM users u
    LEFT JOIN client_auditor_assignments a ON a."auditorId" = u.id AND COALESCE(a."isActive", TRUE) = TRUE
    LEFT JOIN compliance_tasks t ON t.client_id = a."clientId"
    WHERE u."roleId" = (SELECT id FROM roles WHERE name ILIKE 'AUDITOR' LIMIT 1)
    GROUP BY u.id, u.name
    ORDER BY "clientsAssigned" DESC, "overdue" DESC;
  `;
  const { rows } = await pool.query(sql);
  res.json(rows);
});

router.get('/attention', async (req, res) => {
  const range = getRange(req);
  const sql = `
    WITH range_start AS (
      SELECT NOW() - (
        CASE
          WHEN $1 = '7d' THEN INTERVAL '7 days'
          WHEN $1 = '90d' THEN INTERVAL '90 days'
          ELSE INTERVAL '30 days'
        END
      ) AS dt
    )
    SELECT
      CASE
        WHEN t.due_date < CURRENT_DATE AND t.status NOT IN ('COMPLETED','CLOSED') THEN 'Overdue'
        ELSE 'Query Delay'
      END AS "type",
      t.id::text AS "taskId",
      c."clientName" AS "client",
      b."branchName" AS "branch",
      COALESCE(u.name, 'Unassigned') AS "assignedTo",
      t.due_date::text AS "dueDate",
      GREATEST(0, (CURRENT_DATE - t.due_date))::int AS "daysLate",
      CASE
        WHEN (CURRENT_DATE - t.due_date) >= 7 THEN 'High'
        WHEN (CURRENT_DATE - t.due_date) BETWEEN 3 AND 6 THEN 'Medium'
        ELSE 'Low'
      END AS "severity",
      CASE
        WHEN t.escalated_at IS NOT NULL THEN 'Escalated'
        WHEN t.status = 'IN_PROGRESS' THEN 'In Progress'
        ELSE 'Open'
      END AS "status"
    FROM compliance_tasks t
    JOIN clients c ON c.id = t.client_id
    LEFT JOIN client_branches b ON b.id = t.branch_id
    LEFT JOIN users u ON u.id = t.assigned_to_user_id
    WHERE t.created_at >= (SELECT dt FROM range_start)
      AND (
        (t.due_date < CURRENT_DATE AND t.status NOT IN ('COMPLETED','CLOSED'))
      )
    ORDER BY "daysLate" DESC
    LIMIT 50;
  `;
  const { rows } = await pool.query(sql, [range]);
  res.json(rows);
});

module.exports = router;
