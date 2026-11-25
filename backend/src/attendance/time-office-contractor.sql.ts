// Read-only daily evidence. Use the same accepted decisions and pairing rules as
// contractorPunchPair: an earlier OUT never closes a later IN; AUTO needs two punches.
export const contractorTimeOfficeAttendance = `
  SELECT r.id, r.employee_code, r.name, r.branch_id, r.branch, r.statecode,
    'CONTRACTOR'::text AS worker_type, r.contractor_name,
    to_char(pair.in_time AT TIME ZONE 'Asia/Kolkata', 'HH24:MI:SS') AS check_in,
    to_char(pair.out_time AT TIME ZONE 'Asia/Kolkata', 'HH24:MI:SS') AS check_out,
    CASE WHEN pair.out_time > pair.in_time
      THEN round((extract(epoch FROM pair.out_time-pair.in_time)/3600)::numeric,2) END AS worked_hours,
    CASE WHEN p.punch_count > 0 THEN 'RECORDED' ELSE NULL END::text AS approval_status,
    CASE WHEN p.punch_count > 0 THEN 'PRESENT'
      WHEN EXISTS (SELECT 1 FROM holiday_calendar h WHERE h.client_id=$1 AND h.holiday_date=$2::date
        AND (h.branch_id=r.branch_id OR (h.branch_id IS NULL AND (h.state_code IS NULL OR h.state_code=r.statecode)))) THEN 'HOLIDAY'
      ELSE 'NOT_MARKED' END AS status,
    COALESCE(pair.out_time > pair.in_time AND extract(epoch FROM pair.out_time-pair.in_time)/3600 < $5::numeric, false) AS short_hours,
    (p.punch_count > 0 AND (pair.in_time IS NULL OR pair.out_time IS NULL OR pair.out_time <= pair.in_time)) AS incomplete
  FROM contractor_roster r
  LEFT JOIN LATERAL (
    SELECT count(*) AS punch_count,
      min(p.punch_time) FILTER (WHERE p.direction='IN') AS first_in,
      max(p.punch_time) FILTER (WHERE p.direction='IN') AS last_in,
      max(p.punch_time) FILTER (WHERE p.direction='OUT') AS last_out,
      (array_agg(p.direction ORDER BY p.punch_time,p.id))[1] AS first_direction,
      (array_agg(p.direction ORDER BY p.punch_time DESC,p.id DESC))[1] AS last_direction,
      min(p.punch_time) AS first_time, max(p.punch_time) AS last_time
    FROM contractor_biometric_punches p
    WHERE p.client_id=$1 AND p.contractor_employee_id=r.id
      AND COALESCE(p.branch_id,r.branch_id)=r.branch_id
      AND p.punch_time >= ($2::date::timestamp AT TIME ZONE 'Asia/Kolkata')
      AND p.punch_time < (($2::date+1)::timestamp AT TIME ZONE 'Asia/Kolkata')
      AND p.decision IN ('AUTO','REVIEW_APPROVED')
  ) p ON true
  CROSS JOIN LATERAL (SELECT
    COALESCE(p.first_in, CASE WHEN p.first_direction='AUTO' THEN p.first_time END) AS in_time,
    COALESCE(p.last_out, CASE WHEN p.punch_count>1 AND p.last_direction='AUTO' THEN p.last_time END) AS candidate_out
  ) candidate
  CROSS JOIN LATERAL (SELECT candidate.in_time,
    CASE WHEN p.last_in IS NULL OR candidate.candidate_out > p.last_in THEN candidate.candidate_out END AS out_time
  ) pair
  WHERE $8::text <> 'EMPLOYEE' AND ($9::uuid IS NULL OR r.contractor_user_id=$9::uuid)`;
