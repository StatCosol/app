CREATE UNIQUE INDEX IF NOT EXISTS uniq_client_module_change_requests_pending
  ON client_module_change_requests (client_id)
  WHERE status = 'PENDING_CCO';
