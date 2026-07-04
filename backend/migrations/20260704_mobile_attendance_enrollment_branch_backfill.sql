-- Existing kiosk enrollments created by branchless client admins may have
-- face_enrollments.branch_id = NULL. Branch kiosks scope rosters by the
-- enrollment branch, so those active templates look enrolled in the web UI but
-- never reach the kiosk roster. Backfill from the subject's current branch.

DO $$
BEGIN
  IF to_regclass('public.face_enrollments') IS NOT NULL
     AND to_regclass('public.employees') IS NOT NULL THEN
    UPDATE face_enrollments fe
       SET branch_id = e.branch_id
      FROM employees e
     WHERE fe.employee_id = e.id
       AND fe.client_id = e.client_id
       AND fe.branch_id IS NULL
       AND e.branch_id IS NOT NULL;
  END IF;

  IF to_regclass('public.contractor_face_enrollments') IS NOT NULL
     AND to_regclass('public.contractor_employees') IS NOT NULL THEN
    UPDATE contractor_face_enrollments cfe
       SET branch_id = ce.branch_id
      FROM contractor_employees ce
     WHERE cfe.contractor_employee_id = ce.id
       AND cfe.client_id = ce.client_id
       AND cfe.branch_id IS NULL
       AND ce.branch_id IS NOT NULL;
  END IF;
END $$;
