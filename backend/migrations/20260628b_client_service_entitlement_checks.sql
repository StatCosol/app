DO $$
BEGIN
  IF to_regclass('public.client_module_change_requests') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM pg_constraint
        WHERE conrelid = 'public.client_module_change_requests'::regclass
          AND conname = 'chk_client_module_change_package_code'
     ) THEN
    ALTER TABLE public.client_module_change_requests
      ADD CONSTRAINT chk_client_module_change_package_code
      CHECK (package_code = ANY (ARRAY[
        'FULL_SERVICE',
        'CUSTOM_SERVICES',
        'CONTRACTOR_AUDIT_ONLY'
      ]))
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.client_service_packages') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM pg_constraint
        WHERE conrelid = 'public.client_service_packages'::regclass
          AND conname = 'chk_client_service_packages_package_code'
     ) THEN
    ALTER TABLE public.client_service_packages
      ADD CONSTRAINT chk_client_service_packages_package_code
      CHECK (package_code = ANY (ARRAY[
        'FULL_SERVICE',
        'CUSTOM_SERVICES',
        'CONTRACTOR_AUDIT_ONLY'
      ]))
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.client_module_entitlements') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM pg_constraint
        WHERE conrelid = 'public.client_module_entitlements'::regclass
          AND conname = 'chk_client_module_entitlements_module_code'
     ) THEN
    ALTER TABLE public.client_module_entitlements
      ADD CONSTRAINT chk_client_module_entitlements_module_code
      CHECK (module_code = ANY (ARRAY[
        'CONTRACTOR_AUDIT',
        'CONTRACTOR_PORTAL',
        'CONTRACTOR_DOCUMENTS',
        'CONTRACTOR_ATTENDANCE',
        'CONTRACTOR_FACE_ATTENDANCE',
        'PAYROLL',
        'EMPLOYEE_COMPLIANCE',
        'EMPLOYEE_ATTENDANCE',
        'MOBILE_ATTENDANCE',
        'APPRAISAL'
      ]))
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
          AND conname = 'chk_client_module_audit_logs_action'
     ) THEN
    ALTER TABLE public.client_module_audit_logs
      ADD CONSTRAINT chk_client_module_audit_logs_action
      CHECK (action = ANY (ARRAY[
        'REQUESTED',
        'APPROVED',
        'REJECTED',
        'CHANGES_REQUESTED'
      ]))
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
          AND conname = 'chk_client_module_audit_logs_package_code'
     ) THEN
    ALTER TABLE public.client_module_audit_logs
      ADD CONSTRAINT chk_client_module_audit_logs_package_code
      CHECK (
        package_code IS NULL
        OR package_code = ANY (ARRAY[
          'FULL_SERVICE',
          'CUSTOM_SERVICES',
          'CONTRACTOR_AUDIT_ONLY'
        ])
      )
      NOT VALID;
  END IF;
END $$;
