-- Backfill employee face-attendance punches into the daily attendance rollup
-- input table. This is idempotent: existing biometric_punches rows are kept.
DO $$
BEGIN
  IF to_regclass('public.mobile_attendance_punches') IS NULL
     OR to_regclass('public.biometric_punches') IS NULL
     OR to_regclass('public.employees') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.biometric_punches (
    client_id,
    branch_id,
    employee_id,
    employee_code,
    punch_time,
    direction,
    device_id,
    source,
    raw_payload
  )
  SELECT
    mp.client_id,
    COALESCE(mp.branch_id, e.branch_id, d.branch_id),
    e.id,
    e.employee_code,
    mp.punch_time,
    mp.direction,
    mp.device_id::text,
    CASE WHEN d.mode = 'ESS' THEN 'MOBILE_ESS' ELSE 'MOBILE_KIOSK' END,
    jsonb_build_object(
      'sourceTable', 'mobile_attendance_punches',
      'mobileAttendancePunchId', mp.id::text
    )
  FROM public.mobile_attendance_punches mp
  JOIN public.employees e
    ON e.id = mp.employee_id
   AND e.client_id = mp.client_id
  LEFT JOIN public.mobile_attendance_devices d
    ON d.id = mp.device_id
   AND d.client_id = mp.client_id
  ON CONFLICT DO NOTHING;
END $$;
