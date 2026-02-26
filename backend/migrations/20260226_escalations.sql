-- Escalations table
CREATE TABLE IF NOT EXISTS escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  reason text NOT NULL,
  risk_score int NOT NULL,
  sla_overdue_count int NOT NULL DEFAULT 0,
  status varchar(15) NOT NULL DEFAULT 'OPEN',  -- OPEN/ACK/CLOSED
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_escalations_client ON escalations (client_id);
CREATE INDEX IF NOT EXISTS idx_escalations_branch ON escalations (branch_id);
CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations (status);
