-- Read-only diagnostics. Review business context before merging any records.
-- Exact active task identities: titles and dates can change without creating a new activity.
SELECT module, reference_type, reference_id, assigned_role, assigned_user_id,
       client_id, branch_id, contractor_id,
       CASE WHEN reference_type IN ('CONTRACTOR_DOC_EXPIRY','LICENSE_EXPIRY') THEN due_date END AS expiry_cycle,
       COUNT(*) AS copies,
       ARRAY_AGG(id ORDER BY created_at, id) AS task_ids
FROM system_tasks
WHERE status NOT IN ('CLOSED', 'CANCELLED') AND reference_id IS NOT NULL
GROUP BY module, reference_type, reference_id, assigned_role, assigned_user_id,
         client_id, branch_id, contractor_id,
         CASE WHEN reference_type IN ('CONTRACTOR_DOC_EXPIRY','LICENSE_EXPIRY') THEN due_date END
HAVING COUNT(*) > 1
ORDER BY copies DESC;

-- Candidate repeated reminder tickets, not proof that two human requests are duplicates.
SELECT client_id, branch_id, created_by_user_id, assigned_to_user_id, subject,
       (created_at AT TIME ZONE 'Asia/Kolkata')::date AS activity_day,
       COUNT(*) AS copies, ARRAY_AGG(id ORDER BY created_at, id) AS ticket_ids
FROM notifications
WHERE subject LIKE 'Due soon:%' OR subject LIKE 'OVERDUE:%'
   OR subject LIKE 'Document expiring:%' OR subject LIKE 'Expiry Alert:%' OR subject LIKE 'Audit scheduled:%'
GROUP BY client_id, branch_id, created_by_user_id, assigned_to_user_id, subject,
         (created_at AT TIME ZONE 'Asia/Kolkata')::date
HAVING COUNT(*) > 1
ORDER BY activity_day DESC, copies DESC;