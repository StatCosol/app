-- Cron execution logging table
CREATE TABLE IF NOT EXISTS cron_execution_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "jobName"     VARCHAR(120) NOT NULL,
  "startedAt"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "finishedAt"  TIMESTAMPTZ,
  status        VARCHAR(20)  NOT NULL DEFAULT 'RUNNING',
  "itemsProcessed" INT       NOT NULL DEFAULT 0,
  "errorMessage"   TEXT
);

CREATE INDEX IF NOT EXISTS "IDX_CRON_LOG_JOB"     ON cron_execution_logs ("jobName");
CREATE INDEX IF NOT EXISTS "IDX_CRON_LOG_STARTED"  ON cron_execution_logs ("startedAt");
