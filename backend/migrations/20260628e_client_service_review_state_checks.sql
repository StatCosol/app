DO $$
BEGIN
  IF to_regclass('public.client_module_change_requests') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM pg_constraint
        WHERE conrelid = 'public.client_module_change_requests'::regclass
          AND conname = 'chk_client_module_change_review_state'
     ) THEN
    ALTER TABLE public.client_module_change_requests
      ADD CONSTRAINT chk_client_module_change_review_state
      CHECK (
        (
          status = 'PENDING_CCO'
          AND reviewed_at IS NULL
          AND reviewed_by IS NULL
        )
        OR
        (
          status IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED')
          AND reviewed_at IS NOT NULL
        )
      )
      NOT VALID;
  END IF;
END $$;
