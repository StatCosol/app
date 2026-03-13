-- Payroll Queries / Tickets table
CREATE TABLE IF NOT EXISTS payroll_queries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id),
  employee_id   UUID REFERENCES employees(id),
  raised_by     UUID NOT NULL REFERENCES users(id),
  assigned_to   UUID REFERENCES users(id),
  subject       VARCHAR(255) NOT NULL,
  category      VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
  priority      VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  status        VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  description   TEXT,
  resolved_at   TIMESTAMPTZ,
  resolved_by   UUID REFERENCES users(id),
  resolution    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pq_client ON payroll_queries(client_id);
CREATE INDEX IF NOT EXISTS idx_pq_status ON payroll_queries(status);
CREATE INDEX IF NOT EXISTS idx_pq_assigned ON payroll_queries(assigned_to);

-- Query messages / thread
CREATE TABLE IF NOT EXISTS payroll_query_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id    UUID NOT NULL REFERENCES payroll_queries(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES users(id),
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pqm_query ON payroll_query_messages(query_id);

-- Full & Final settlements
CREATE TABLE IF NOT EXISTS payroll_fnf (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id),
  employee_id     UUID NOT NULL REFERENCES employees(id),
  separation_date DATE NOT NULL,
  last_working_day DATE,
  reason          VARCHAR(100),
  status          VARCHAR(30) NOT NULL DEFAULT 'INITIATED',
  checklist       JSONB DEFAULT '[]',
  settlement_amount DECIMAL(14,2),
  remarks         TEXT,
  initiated_by    UUID REFERENCES users(id),
  approved_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fnf_client ON payroll_fnf(client_id);
CREATE INDEX IF NOT EXISTS idx_fnf_status ON payroll_fnf(status);
CREATE INDEX IF NOT EXISTS idx_fnf_employee ON payroll_fnf(employee_id);
