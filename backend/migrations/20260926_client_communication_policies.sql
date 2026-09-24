-- Additive configuration only. No client, employee or communication history is changed.
CREATE TABLE IF NOT EXISTS client_communication_policies (
  client_id uuid NOT NULL REFERENCES clients(id),
  comm_type text NOT NULL CHECK (comm_type IN ('PAYROLL_INPUT_REQUEST','MCD_REQUEST')),
  request_day integer NOT NULL CHECK (request_day BETWEEN 1 AND 28),
  deadline_day integer NOT NULL CHECK (deadline_day BETWEEN request_day AND 28),
  enabled boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id,comm_type)
);
