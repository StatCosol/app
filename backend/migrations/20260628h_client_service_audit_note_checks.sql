DO $$
BEGIN
  IF to_regclass('public.client_module_audit_logs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM pg_constraint
        WHERE conrelid = 'public.client_module_audit_logs'::regclass
          AND conname = 'chk_client_module_audit_logs_note_required'
     ) THEN
    ALTER TABLE public.client_module_audit_logs
      ADD CONSTRAINT chk_client_module_audit_logs_note_required
      CHECK (
        action IN ('REQUESTED', 'APPROVED')
        OR NULLIF(BTRIM(note), '') IS NOT NULL
      )
      NOT VALID;
  END IF;
END $$;
