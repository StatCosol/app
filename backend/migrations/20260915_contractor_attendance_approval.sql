CREATE TABLE IF NOT EXISTS contractor_attendance_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  branch_id uuid NOT NULL REFERENCES client_branches(id),
  contractor_user_id uuid NOT NULL REFERENCES users(id),
  period_month varchar(7) NOT NULL CHECK (period_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  source varchar(20) NOT NULL DEFAULT 'EXCEL' CHECK (source IN ('EXCEL','SYSTEM')),
  rows_snapshot jsonb NOT NULL CHECK (jsonb_typeof(rows_snapshot)='array'),
  status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','RETURNED')),
  is_current boolean NOT NULL DEFAULT true,
  source_document_id uuid REFERENCES contractor_documents(id),
  submitted_by uuid NOT NULL REFERENCES users(id),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status='PENDING' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR
         (status<>'PENDING' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS contractor_attendance_current
  ON contractor_attendance_batches(client_id,contractor_user_id,branch_id,period_month) WHERE is_current;
