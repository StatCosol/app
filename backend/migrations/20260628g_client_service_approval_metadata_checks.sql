DO $$
BEGIN
  IF to_regclass('public.client_service_packages') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM pg_constraint
        WHERE conrelid = 'public.client_service_packages'::regclass
          AND conname = 'chk_client_service_packages_approval_metadata'
     ) THEN
    ALTER TABLE public.client_service_packages
      ADD CONSTRAINT chk_client_service_packages_approval_metadata
      CHECK (approved_at IS NOT NULL OR approved_by IS NULL)
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
          AND conname = 'chk_client_module_entitlements_approval_metadata'
     ) THEN
    ALTER TABLE public.client_module_entitlements
      ADD CONSTRAINT chk_client_module_entitlements_approval_metadata
      CHECK (approved_at IS NOT NULL OR approved_by IS NULL)
      NOT VALID;
  END IF;
END $$;
