/**
 * Notification SQL Queries
 *
 * Fast queries for inbox/outbox listing with full text search
 * Uses indexed columns for optimal performance
 */

/**
 * List notifications for inbox or outbox
 *
 * Parameters:
 * $1 = box ('INBOX' | 'OUTBOX')
 * $2 = userId (UUID)
 * $3 = status (nullable)
 * $4 = queryType (nullable)
 * $5 = clientId (nullable)
 * $6 = branchId (nullable)
 * $7 = fromDate (nullable)
 * $8 = toDate (nullable)
 * $9 = search (nullable)
 * $10 = limit
 * $11 = offset
 */
export const NOTIFICATIONS_LIST_SQL = `
SELECT
  n.id,
  n.created_by_user_id,
  fu.name AS created_by_name,
  n.created_by_role,
  n.assigned_to_user_id,
  tu.name AS assigned_to_name,
  n.assigned_to_role,
  n.client_id,
  c.client_name AS client_name,
  n.branch_id,
  cb.branchname AS branch_name,
  n.query_type,
  n.subject,
  n.status,
  n.priority,
  n.created_at,
  n.read_at
FROM notifications n
LEFT JOIN users fu ON fu.id = n.created_by_user_id
LEFT JOIN users tu ON tu.id = n.assigned_to_user_id
LEFT JOIN clients c ON c.id = n.client_id
LEFT JOIN client_branches cb ON cb.id = n.branch_id
WHERE
  (
    ($1::text = 'INBOX' AND n.assigned_to_user_id = $2::uuid)
    OR
    ($1::text = 'OUTBOX' AND n.created_by_user_id = $2::uuid)
  )
  AND ($3::text IS NULL OR n.status = $3)
  AND ($4::text IS NULL OR n.query_type = $4)
  AND ($5::uuid IS NULL OR n.client_id = $5)
  AND ($6::uuid IS NULL OR n.branch_id = $6)
  AND ($7::date IS NULL OR n.created_at::date >= $7)
  AND ($8::date IS NULL OR n.created_at::date <= $8)
  AND (
    $9::text IS NULL
    OR n.subject ILIKE ('%' || $9 || '%')
  )
ORDER BY n.created_at DESC
LIMIT $10 OFFSET $11;
`;

/**
 * Get notification detail by ID
 *
 * Parameters:
 * $1 = notificationId (UUID)
 */
export const NOTIFICATION_DETAIL_SQL = `
SELECT
  n.*,
  fu.name AS created_by_name,
  tu.name AS assigned_to_name,
  c.client_name AS client_name,
  cb.branchname AS branch_name
FROM notifications n
LEFT JOIN users fu ON fu.id = n.created_by_user_id
LEFT JOIN users tu ON tu.id = n.assigned_to_user_id
LEFT JOIN clients c ON c.id = n.client_id
LEFT JOIN client_branches cb ON cb.id = n.branch_id
WHERE n.id = $1::uuid;
`;
