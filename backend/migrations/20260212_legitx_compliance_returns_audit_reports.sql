-- LegitX compliance support: returns/filings and audit reports

-- Returns / Filings
CREATE TABLE IF NOT EXISTS compliance_returns (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id uuid NOT NULL,
  branch_id uuid NULL,
  law_type varchar(50) NOT NULL,
  return_type varchar(120) NOT NULL,
  period_year int NOT NULL,
  period_month int NULL,
  period_label varchar(20),
  due_date date NULL,
  filed_date date NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  filed_by_user_id uuid NULL,
  ack_number varchar(100) NULL,
  ack_file_path text NULL,
  challan_file_path text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_returns_client ON compliance_returns (client_id);
CREATE INDEX IF NOT EXISTS idx_compliance_returns_branch ON compliance_returns (branch_id);
CREATE INDEX IF NOT EXISTS idx_compliance_returns_period ON compliance_returns (period_year, period_month);

-- Audit Reports
CREATE TABLE IF NOT EXISTS audit_reports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  audit_id uuid NOT NULL,
  file_name varchar(255) NOT NULL,
  file_path text NOT NULL,
  uploaded_by_user_id uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  report_date date NULL,
  is_public boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_audit_reports_audit ON audit_reports (audit_id);

-- Optional: audit score
ALTER TABLE audits ADD COLUMN IF NOT EXISTS score_percent int NULL;