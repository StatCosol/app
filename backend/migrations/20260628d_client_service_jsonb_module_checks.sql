DO $$
BEGIN
  IF to_regclass('public.client_module_change_requests') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM pg_constraint
        WHERE conrelid = 'public.client_module_change_requests'::regclass
          AND conname = 'chk_client_module_change_requested_modules_allowed'
     ) THEN
    ALTER TABLE public.client_module_change_requests
      ADD CONSTRAINT chk_client_module_change_requested_modules_allowed
      CHECK (
        jsonb_typeof(requested_modules) = 'array'
        AND requested_modules <@ '[
          "CONTRACTOR_AUDIT",
          "CONTRACTOR_PORTAL",
          "CONTRACTOR_DOCUMENTS",
          "CONTRACTOR_ATTENDANCE",
          "CONTRACTOR_FACE_ATTENDANCE",
          "PAYROLL",
          "EMPLOYEE_COMPLIANCE",
          "EMPLOYEE_ATTENDANCE",
          "MOBILE_ATTENDANCE",
          "APPRAISAL"
        ]'::jsonb
      )
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.client_module_change_requests') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM pg_constraint
        WHERE conrelid = 'public.client_module_change_requests'::regclass
          AND conname = 'chk_client_module_change_current_modules_allowed'
     ) THEN
    ALTER TABLE public.client_module_change_requests
      ADD CONSTRAINT chk_client_module_change_current_modules_allowed
      CHECK (
        jsonb_typeof(current_modules) = 'array'
        AND current_modules <@ '[
          "CONTRACTOR_AUDIT",
          "CONTRACTOR_PORTAL",
          "CONTRACTOR_DOCUMENTS",
          "CONTRACTOR_ATTENDANCE",
          "CONTRACTOR_FACE_ATTENDANCE",
          "PAYROLL",
          "EMPLOYEE_COMPLIANCE",
          "EMPLOYEE_ATTENDANCE",
          "MOBILE_ATTENDANCE",
          "APPRAISAL"
        ]'::jsonb
      )
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.client_module_audit_logs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM pg_constraint
        WHERE conrelid = 'public.client_module_audit_logs'::regclass
          AND conname = 'chk_client_module_audit_logs_modules_allowed'
     ) THEN
    ALTER TABLE public.client_module_audit_logs
      ADD CONSTRAINT chk_client_module_audit_logs_modules_allowed
      CHECK (
        jsonb_typeof(modules) = 'array'
        AND modules <@ '[
          "CONTRACTOR_AUDIT",
          "CONTRACTOR_PORTAL",
          "CONTRACTOR_DOCUMENTS",
          "CONTRACTOR_ATTENDANCE",
          "CONTRACTOR_FACE_ATTENDANCE",
          "PAYROLL",
          "EMPLOYEE_COMPLIANCE",
          "EMPLOYEE_ATTENDANCE",
          "MOBILE_ATTENDANCE",
          "APPRAISAL"
        ]'::jsonb
      )
      NOT VALID;
  END IF;
END $$;
