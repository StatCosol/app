-- Branch risk snapshots (daily risk score history)
CREATE TABLE IF NOT EXISTS branch_risk_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  snapshot_date date NOT NULL,
  risk_score int NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_snapshots_branch ON branch_risk_snapshots (branch_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_risk_snapshots_client ON branch_risk_snapshots (client_id);

-- Ensure one snapshot per branch per day
CREATE UNIQUE INDEX IF NOT EXISTS uq_risk_snapshot_branch_date ON branch_risk_snapshots (branch_id, snapshot_date);
