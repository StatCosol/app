import { COUNTED_DECISIONS } from '../mobile-attendance/punch/punch-direction.service';

export const LICENCE_REGISTRATIONS_SQL = `
 SELECT r.id AS "registrationId", r.client_id AS "clientId", r.branch_id AS "branchId",
   r.type, r.registration_number AS "registrationNumber", r.expiry_date::text AS "expiryDate",
   r.licensed_worker_limit AS "licensedWorkerLimit", b.branchname AS "branchName",
   c.client_name AS "clientName"
 FROM branch_registrations r
 JOIN client_branches b ON b.id=r.branch_id AND b.clientid=r.client_id
 JOIN clients c ON c.id=r.client_id
 WHERE COALESCE(r.status,'ACTIVE') <> 'DELETED'
   AND b.isdeleted=false AND b.isactive=true AND c.is_deleted=false AND c.is_active=true
   AND ($1::uuid[] IS NULL OR r.branch_id=ANY($1::uuid[]))
 ORDER BY b.branchname, r.type, r.id`;

// UNION deduplicates mirrored IN/OUT events and repeated visits across all accepted sources.
// Namespaces keep on-roll and contractor UUIDs separate; deployment is per physical branch.
export const DAILY_MANPOWER_SQL = `
 WITH on_roll AS (
   SELECT p.client_id, e.branch_id, e.id AS person_id, 'ON_ROLL' AS worker_type
   FROM ess_attendance_punches p JOIN employees e ON e.id=p.employee_id AND e.client_id=p.client_id
   WHERE e.branch_id=ANY($1::uuid[]) AND p.date=$2::date
     AND p.punch_time >= ($2::date::timestamp AT TIME ZONE 'Asia/Kolkata')
     AND p.punch_time < (($2::date+1)::timestamp AT TIME ZONE 'Asia/Kolkata')
   UNION
   SELECT p.client_id, COALESCE(p.branch_id,e.branch_id), e.id, 'ON_ROLL'
   FROM facedesk_attendance_logs p JOIN employees e ON e.id=p.employee_id AND e.client_id=p.client_id
   WHERE COALESCE(p.branch_id,e.branch_id)=ANY($1::uuid[])
     AND p.punch_time >= ($2::date::timestamp AT TIME ZONE 'Asia/Kolkata')
     AND p.punch_time < (($2::date+1)::timestamp AT TIME ZONE 'Asia/Kolkata')
     AND p.attendance_status IN ('MARKED','APPROVED')
     AND NOT EXISTS (SELECT 1 FROM facedesk_attendance_review_queue rq
       WHERE rq.client_id=p.client_id AND rq.attendance_id=p.attendance_id AND rq.status='PENDING')
   UNION
   SELECT p.client_id, COALESCE(p.branch_id,e.branch_id), e.id, 'ON_ROLL'
   FROM mobile_attendance_punches p JOIN employees e ON e.id=p.employee_id AND e.client_id=p.client_id
   WHERE COALESCE(p.branch_id,e.branch_id)=ANY($1::uuid[]) AND p.decision IN ${COUNTED_DECISIONS}
     AND p.punch_time >= ($2::date::timestamp AT TIME ZONE 'Asia/Kolkata')
     AND p.punch_time < (($2::date+1)::timestamp AT TIME ZONE 'Asia/Kolkata')
   UNION
   SELECT p.client_id, COALESCE(p.branch_id,e.branch_id), e.id, 'ON_ROLL'
   FROM biometric_punches p JOIN employees e ON e.id=p.employee_id AND e.client_id=p.client_id
   WHERE COALESCE(p.branch_id,e.branch_id)=ANY($1::uuid[])
     AND COALESCE(p.source,'DEVICE') NOT IN ('MOBILE_KIOSK','MOBILE_ESS')
     AND p.punch_time >= ($2::date::timestamp AT TIME ZONE 'Asia/Kolkata')
     AND p.punch_time < (($2::date+1)::timestamp AT TIME ZONE 'Asia/Kolkata')
 ), contractors AS (
   SELECT p.client_id, COALESCE(p.branch_id,e.branch_id) AS branch_id,
     e.id AS person_id, 'CONTRACTOR' AS worker_type
   FROM contractor_biometric_punches p JOIN contractor_employees e
     ON e.id=p.contractor_employee_id AND e.client_id=p.client_id
   WHERE COALESCE(p.branch_id,e.branch_id)=ANY($1::uuid[]) AND p.decision IN ${COUNTED_DECISIONS}
     AND p.punch_time >= ($2::date::timestamp AT TIME ZONE 'Asia/Kolkata')
     AND p.punch_time < (($2::date+1)::timestamp AT TIME ZONE 'Asia/Kolkata')
   UNION
   SELECT p.client_id, COALESCE(p.branch_id,e.branch_id), e.id, 'CONTRACTOR'
   FROM biometric_punches p JOIN contractor_employees e
     ON e.id=p.contractor_employee_id AND e.client_id=p.client_id
   WHERE COALESCE(p.branch_id,e.branch_id)=ANY($1::uuid[])
     AND COALESCE(p.source,'DEVICE') NOT IN ('MOBILE_KIOSK','MOBILE_ESS')
     AND p.punch_time >= ($2::date::timestamp AT TIME ZONE 'Asia/Kolkata')
     AND p.punch_time < (($2::date+1)::timestamp AT TIME ZONE 'Asia/Kolkata')
 ), people AS (SELECT * FROM on_roll UNION SELECT * FROM contractors)
 SELECT client_id AS "clientId", branch_id AS "branchId",
   COUNT(*) FILTER (WHERE worker_type='ON_ROLL')::int AS "onRoll",
   COUNT(*) FILTER (WHERE worker_type='CONTRACTOR')::int AS contractor
 FROM people GROUP BY client_id, branch_id`;

export const LICENCE_RECIPIENTS_SQL = `
 SELECT DISTINCT lower(trim(u.email)) AS email FROM users u JOIN roles rl ON rl.id=u.role_id
 WHERE u.is_active=true AND u.deleted_at IS NULL AND u.email IS NOT NULL AND trim(u.email) <> ''
 AND (
   (u.client_id=$1 AND rl.code='CLIENT' AND (
     (u.user_type='MASTER') OR
     (COALESCE(u.user_type,'') <> 'BRANCH' AND NOT EXISTS(SELECT 1 FROM user_branches ub WHERE ub.user_id=u.id)) OR
     EXISTS(SELECT 1 FROM user_branches ub WHERE ub.user_id=u.id AND ub.branch_id=$2)
   ))
   OR (u.client_id=$1 AND rl.code='BRANCH_DESK' AND EXISTS(
     SELECT 1 FROM user_branches ub WHERE ub.user_id=u.id AND ub.branch_id=$2))
   OR (rl.code='CRM' AND EXISTS(SELECT 1 FROM client_assignments_current ca
     WHERE ca.client_id=$1 AND ca.assignment_type='CRM' AND ca.assigned_to_user_id=u.id))
 )`;
