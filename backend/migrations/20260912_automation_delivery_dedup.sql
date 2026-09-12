-- Apply before starting the updated automation workers. No historical records are removed.
CREATE TABLE IF NOT EXISTS automation_delivery_receipts (
  delivery_key text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS registration_renewal_links (
  registration_id uuid NOT NULL,
  expiry_date date NOT NULL,
  filing_id uuid NOT NULL UNIQUE REFERENCES compliance_returns(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (registration_id, expiry_date)
);