-- Registration alerts / in-app notification system
-- 2026-02-26

CREATE TABLE IF NOT EXISTS registration_alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES branch_registrations(id) ON DELETE CASCADE,
  client_id     UUID NOT NULL,
  branch_id     UUID NOT NULL,
  alert_type    VARCHAR(30) NOT NULL,          -- '60_DAY', '30_DAY', '7_DAY', 'EXPIRED'
  priority      VARCHAR(10) NOT NULL DEFAULT 'LOW', -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  title         TEXT NOT NULL,
  message       TEXT NOT NULL,
  module        VARCHAR(30) NOT NULL DEFAULT 'REGISTRATION',
  is_read       BOOLEAN NOT NULL DEFAULT false,
  emailed       BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reg_alerts_client     ON registration_alerts(client_id);
CREATE INDEX IF NOT EXISTS idx_reg_alerts_branch     ON registration_alerts(branch_id);
CREATE INDEX IF NOT EXISTS idx_reg_alerts_reg        ON registration_alerts(registration_id);
CREATE INDEX IF NOT EXISTS idx_reg_alerts_created    ON registration_alerts(created_at DESC);
