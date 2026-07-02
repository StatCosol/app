-- Tables referenced by live service actions but missing from older schemas.

CREATE TABLE IF NOT EXISTS branch_compliance_overrides_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL,
  compliance_id uuid NOT NULL,
  old_override_mode text,
  new_override_mode text NOT NULL,
  old_is_applicable boolean,
  new_is_applicable boolean,
  reason text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bcoa_branch_compliance
  ON branch_compliance_overrides_audit(branch_id, compliance_id);

CREATE INDEX IF NOT EXISTS idx_bcoa_changed_at
  ON branch_compliance_overrides_audit(changed_at DESC);

CREATE TABLE IF NOT EXISTS notification_thread_participants (
  thread_id uuid NOT NULL,
  user_id uuid NOT NULL,
  participant_role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ntp_user
  ON notification_thread_participants(user_id);

DO $$
BEGIN
  IF to_regclass('public.notification_threads') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'fk_ntp_thread'
     ) THEN
    ALTER TABLE notification_thread_participants
      ADD CONSTRAINT fk_ntp_thread
      FOREIGN KEY (thread_id)
      REFERENCES notification_threads(id)
      ON DELETE CASCADE;
  END IF;

  IF to_regclass('public.users') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'fk_ntp_user'
     ) THEN
    ALTER TABLE notification_thread_participants
      ADD CONSTRAINT fk_ntp_user
      FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE;
  END IF;
END $$;
