DO $$
BEGIN
  IF to_regclass('public.client_module_change_requests') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM pg_constraint
        WHERE conrelid = 'public.client_module_change_requests'::regclass
          AND conname = 'chk_client_module_change_review_note_required'
     ) THEN
    ALTER TABLE public.client_module_change_requests
      ADD CONSTRAINT chk_client_module_change_review_note_required
      CHECK (
        status IN ('PENDING_CCO', 'APPROVED')
        OR NULLIF(BTRIM(review_note), '') IS NOT NULL
      )
      NOT VALID;
  END IF;
END $$;
