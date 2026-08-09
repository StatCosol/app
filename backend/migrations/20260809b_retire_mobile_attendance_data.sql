-- Close out ESS Mobile Attendance employee biometric data after module retirement.

DO $$
BEGIN
  IF to_regclass('public.face_enrollments') IS NOT NULL THEN
    UPDATE face_enrollments
       SET is_active = false,
           deactivated_at = COALESCE(deactivated_at, now()),
           deactivation_reason = COALESCE(
             deactivation_reason,
             'ESS Mobile Attendance retired'
           ),
           embedding = NULL,
           photo_url = NULL
     WHERE is_active = true;
  END IF;

  IF to_regclass('public.mobile_attendance_punches') IS NOT NULL THEN
    UPDATE mobile_attendance_punches
       SET decision = 'REVIEW_REJECTED',
           review_note = COALESCE(
             review_note,
             'ESS Mobile Attendance retired'
           ),
           reviewed_at = COALESCE(reviewed_at, now())
     WHERE decision = 'REVIEW_PENDING';
  END IF;

  IF to_regclass('public.face_reenrollment_requests') IS NOT NULL THEN
    UPDATE face_reenrollment_requests
       SET status = 'CANCELLED',
           reviewed_at = COALESCE(reviewed_at, now()),
           review_note = COALESCE(
             review_note,
             'ESS Mobile Attendance retired'
           )
     WHERE status = 'PENDING';
  END IF;
END $$;
