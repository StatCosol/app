CREATE TABLE IF NOT EXISTS client_module_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  package_code TEXT NOT NULL,
  requested_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'PENDING_CCO',
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_note TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  CONSTRAINT chk_client_module_change_status
    CHECK (status IN ('PENDING_CCO', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED'))
);

CREATE INDEX IF NOT EXISTS idx_client_module_change_requests_client_status
  ON client_module_change_requests (client_id, status, requested_at DESC);

CREATE TABLE IF NOT EXISTS client_service_packages (
  client_id UUID PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  package_code TEXT NOT NULL DEFAULT 'FULL_SERVICE',
  request_id UUID REFERENCES client_module_change_requests(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_module_entitlements (
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  module_code TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  request_id UUID REFERENCES client_module_change_requests(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, module_code)
);

CREATE INDEX IF NOT EXISTS idx_client_module_entitlements_enabled
  ON client_module_entitlements (client_id, is_enabled, module_code);

CREATE TABLE IF NOT EXISTS client_module_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  request_id UUID REFERENCES client_module_change_requests(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  package_code TEXT,
  modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_module_audit_logs_client_created
  ON client_module_audit_logs (client_id, created_at DESC);
