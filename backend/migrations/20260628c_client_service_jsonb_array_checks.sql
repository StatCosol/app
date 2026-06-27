DO $$
BEGIN
  IF to_regclass('public.client_module_change_requests') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM pg_constraint
        WHERE conrelid = 'public.client_module_change_requests'::regclass
          AND conname = 'chk_client_module_change_requested_modules_array'
     ) THEN
    ALTER TABLE public.client_module_change_requests
      ADD CONSTRAINT chk_client_module_change_requested_modules_array
      CHECK (jsonb_typeof(requested_modules) = 'array')
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
          AND conname = 'chk_client_module_change_current_modules_array'
     ) THEN
    ALTER TABLE public.client_module_change_requests
      ADD CONSTRAINT chk_client_module_change_current_modules_array
      CHECK (jsonb_typeof(current_modules) = 'array')
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
          AND conname = 'chk_client_module_audit_logs_modules_array'
     ) THEN
    ALTER TABLE public.client_module_audit_logs
      ADD CONSTRAINT chk_client_module_audit_logs_modules_array
      CHECK (jsonb_typeof(modules) = 'array')
      NOT VALID;
  END IF;
END $$;
