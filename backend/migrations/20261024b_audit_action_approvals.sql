-- Keep request history even when an unused audit is deleted after CCO approval.
CREATE TABLE IF NOT EXISTS audit_action_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL,
  client_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('CANCEL','DELETE')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 5 AND 2000),
  status text NOT NULL DEFAULT 'PENDING_CCO' CHECK (status IN ('PENDING_CCO','APPROVED','REJECTED')),
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  audit_snapshot jsonb NOT NULL,
  CHECK (reviewed_by IS NULL OR reviewed_by <> requested_by)
);
CREATE UNIQUE INDEX IF NOT EXISTS audit_action_pending_unique ON audit_action_requests(audit_id) WHERE status='PENDING_CCO';
CREATE INDEX IF NOT EXISTS audit_action_client_history ON audit_action_requests(client_id,requested_at DESC);
