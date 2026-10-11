ALTER TABLE branch_registrations ADD COLUMN IF NOT EXISTS licensed_worker_limit integer;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_registration_worker_limit' AND conrelid='branch_registrations'::regclass) THEN
    ALTER TABLE branch_registrations ADD CONSTRAINT chk_registration_worker_limit
      CHECK (licensed_worker_limit IS NULL OR licensed_worker_limit > 0);
  END IF;
END $$;

ALTER TABLE registration_alerts ADD COLUMN IF NOT EXISTS event_key text;
ALTER TABLE registration_alerts ADD COLUMN IF NOT EXISTS email_lease_until timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS uq_registration_alert_event
  ON registration_alerts(event_key) WHERE event_key IS NOT NULL;
