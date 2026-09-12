-- Query indexes validated with synthetic monthly-close datasets.
-- The migration runner uses a transaction. Schedule on staging first, then a
-- maintenance window: regular CREATE INDEX can block writes while it builds.
-- Do not wait indefinitely behind a busy table.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE INDEX IF NOT EXISTS idx_att_scope_period_approval
  ON attendance_records (client_id, branch_id, date) INCLUDE (approval_status);

CREATE INDEX IF NOT EXISTS idx_cd_scope_latest
  ON contractor_documents
  (client_id, branch_id, contractor_user_id, doc_type, doc_month, created_at DESC, id DESC);
