-- Notification delivery metadata only. No compliance, payroll or balance updates.
CREATE TABLE IF NOT EXISTS notification_email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  category varchar(40) NOT NULL,
  subject text NOT NULL,
  title text NOT NULL,
  body_html text NOT NULL,
  available_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notification_email_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient text NOT NULL,
  delivery_date date NOT NULL,
  status varchar(20) NOT NULL CHECK(status IN ('SENDING','SENT','UNKNOWN')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  message_id text,
  error_message text,
  UNIQUE(recipient,delivery_date)
);
CREATE TABLE IF NOT EXISTS notification_email_recipients (
  event_id uuid NOT NULL REFERENCES notification_email_events(id),
  recipient text NOT NULL,
  digest_id uuid REFERENCES notification_email_digests(id),
  PRIMARY KEY(event_id,recipient)
);
CREATE INDEX IF NOT EXISTS notification_email_recipients_pending
  ON notification_email_recipients(recipient,event_id) WHERE digest_id IS NULL;
CREATE INDEX IF NOT EXISTS notification_email_events_available ON notification_email_events(available_on);
ALTER TABLE client_monthly_comm_runs ADD COLUMN IF NOT EXISTS digest_event_id uuid REFERENCES notification_email_events(id);
ALTER TABLE registration_alerts ADD COLUMN IF NOT EXISTS digest_event_id uuid REFERENCES notification_email_events(id);
ALTER TABLE invoice_email_logs ADD COLUMN IF NOT EXISTS digest_event_id uuid REFERENCES notification_email_events(id);
ALTER TABLE invoice_email_logs ADD COLUMN IF NOT EXISTS digest_delivery_applied boolean NOT NULL DEFAULT false;
-- Respect either historic varchar columns or the enum created by TypeORM.
DO $$ DECLARE typ record; BEGIN
 FOR typ IN SELECT DISTINCT n.nspname,t.typname FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
 JOIN pg_type t ON t.oid=a.atttypid JOIN pg_namespace n ON n.oid=t.typnamespace
 WHERE c.relname='invoice_email_logs' AND c.relnamespace=current_schema()::regnamespace AND a.attname='sent_status' AND t.typtype='e'
 LOOP
  EXECUTE format('ALTER TYPE %I.%I ADD VALUE IF NOT EXISTS %L',typ.nspname,typ.typname,'QUEUED');
  EXECUTE format('ALTER TYPE %I.%I ADD VALUE IF NOT EXISTS %L',typ.nspname,typ.typname,'UNKNOWN');
 END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS invoice_email_logs_digest_payment
 ON invoice_email_logs(pending_payment_id,digest_event_id) WHERE digest_event_id IS NOT NULL;
ALTER TABLE client_monthly_comm_runs ALTER COLUMN sent_at DROP NOT NULL;
ALTER TABLE client_monthly_comm_runs ALTER COLUMN sent_at DROP DEFAULT;
CREATE INDEX IF NOT EXISTS client_monthly_comm_runs_digest_pending ON client_monthly_comm_runs(digest_event_id) WHERE status='QUEUED';
CREATE INDEX IF NOT EXISTS registration_alerts_digest_pending ON registration_alerts(digest_event_id) WHERE NOT emailed AND digest_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoice_email_logs_digest_event ON invoice_email_logs(digest_event_id) WHERE digest_event_id IS NOT NULL;
