-- Create notification_reads table with notification_id (not thread_id)
CREATE TABLE IF NOT EXISTS notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL,
  user_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_notification_reads_notification_user UNIQUE (notification_id, user_id),
  CONSTRAINT fk_notification_reads_notification
    FOREIGN KEY (notification_id) REFERENCES notification_threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user
  ON notification_reads(user_id);

CREATE INDEX IF NOT EXISTS idx_notification_reads_notification
  ON notification_reads(notification_id);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user_notification_lastread
  ON notification_reads(user_id, notification_id, last_read_at);


-- Add/ensure message index (for speed)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notification_messages' AND column_name = 'thread_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_notification_messages_thread_created
      ON notification_messages(thread_id, created_at);
  END IF;
END $$;
