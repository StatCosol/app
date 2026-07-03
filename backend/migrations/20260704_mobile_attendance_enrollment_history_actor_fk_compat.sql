-- Legacy production databases may still have a user foreign key on
-- face_enrollment_history.actor_user_id. The current mobile attendance schema
-- keeps this as nullable audit metadata because kiosk submissions are performed
-- with a device token, while the ticket itself stores the requesting user.
DO $$
DECLARE
  fk_name text;
BEGIN
  IF to_regclass('public.face_enrollment_history') IS NOT NULL THEN
    ALTER TABLE public.face_enrollment_history
      ADD COLUMN IF NOT EXISTS actor_user_id UUID;

    ALTER TABLE public.face_enrollment_history
      ALTER COLUMN actor_user_id DROP NOT NULL;

    FOR fk_name IN
      SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        JOIN pg_class ref_rel ON ref_rel.oid = con.confrelid
        JOIN pg_attribute att
          ON att.attrelid = rel.oid
         AND att.attnum = ANY(con.conkey)
       WHERE nsp.nspname = 'public'
         AND rel.relname = 'face_enrollment_history'
         AND con.contype = 'f'
         AND att.attname = 'actor_user_id'
    LOOP
      EXECUTE format(
        'ALTER TABLE public.face_enrollment_history DROP CONSTRAINT IF EXISTS %I',
        fk_name
      );
    END LOOP;
  END IF;
END $$;
