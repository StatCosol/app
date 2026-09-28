CREATE TABLE IF NOT EXISTS audit_follow_up_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  nc_id uuid NOT NULL REFERENCES audit_non_compliances(id) ON DELETE CASCADE,
  resubmission_id uuid NOT NULL REFERENCES audit_resubmissions(id) ON DELETE CASCADE,
  event varchar(30) NOT NULL CHECK (event IN ('NC_ACCEPTED', 'NC_REJECTED', 'NC_REUPLOADED')),
  payload jsonb NOT NULL,
  status varchar(15) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'RETRY', 'SUCCEEDED', 'SKIPPED', 'FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error varchar(200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (resubmission_id, event)
);

CREATE INDEX IF NOT EXISTS idx_audit_follow_up_ready
  ON audit_follow_up_jobs(next_attempt_at, id)
  WHERE status IN ('PENDING', 'RETRY');
CREATE INDEX IF NOT EXISTS idx_audit_follow_up_history
  ON audit_follow_up_jobs(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_follow_up_audit
  ON audit_follow_up_jobs(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_follow_up_nc
  ON audit_follow_up_jobs(nc_id);
