-- Keep active face templates aligned to the subject's current branch so branch
-- kiosk rosters include employees/contractors after admin-created enrollments
-- or later branch transfers.

DO $$
BEGIN
  IF to_regclass('public.face_enrollments') IS NOT NULL
     AND to_regclass('public.employees') IS NOT NULL THEN
    UPDATE face_enrollments fe
       SET branch_id = e.branch_id
      FROM employees e
     WHERE fe.employee_id = e.id
       AND fe.client_id = e.client_id
       AND fe.is_active IS TRUE
       AND e.branch_id IS NOT NULL
       AND fe.branch_id IS DISTINCT FROM e.branch_id;
  END IF;

  IF to_regclass('public.contractor_face_enrollments') IS NOT NULL
     AND to_regclass('public.contractor_employees') IS NOT NULL THEN
    UPDATE contractor_face_enrollments cfe
       SET branch_id = ce.branch_id
      FROM contractor_employees ce
     WHERE cfe.contractor_employee_id = ce.id
       AND cfe.client_id = ce.client_id
       AND cfe.is_active IS TRUE
       AND ce.branch_id IS NOT NULL
       AND cfe.branch_id IS DISTINCT FROM ce.branch_id;
  END IF;
END $$;
