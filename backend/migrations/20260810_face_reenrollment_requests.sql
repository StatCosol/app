-- Pending face re-enrollment requests (ESS / kiosk) reviewed before overwriting live embeddings.

CREATE TABLE IF NOT EXISTS face_reenrollment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  branch_id UUID,
  employee_id UUID NOT NULL,
  requested_by UUID,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT,
  photo_url TEXT,
  pending_embedding BYTEA NOT NULL,
  embedding_model VARCHAR(40),
  source VARCHAR(10) NOT NULL DEFAULT 'ESS',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT face_reenroll_status_chk CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  CONSTRAINT face_reenroll_source_chk CHECK (source IN ('ADMIN','ESS','KIOSK'))
);

CREATE UNIQUE INDEX IF NOT EXISTS face_reenroll_one_pending_per_employee
  ON face_reenrollment_requests (employee_id)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS face_reenroll_client_status_idx
  ON face_reenrollment_requests (client_id, status, requested_at DESC);

CREATE TABLE IF NOT EXISTS contractor_face_reenrollment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  branch_id UUID,
  contractor_employee_id UUID NOT NULL,
  requested_by UUID,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT,
  photo_url TEXT,
  pending_embedding BYTEA NOT NULL,
  embedding_model VARCHAR(40),
  source VARCHAR(10) NOT NULL DEFAULT 'ESS',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contractor_face_reenroll_status_chk CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  CONSTRAINT contractor_face_reenroll_source_chk CHECK (source IN ('ADMIN','ESS','KIOSK'))
);

CREATE UNIQUE INDEX IF NOT EXISTS contractor_face_reenroll_one_pending
  ON contractor_face_reenrollment_requests (contractor_employee_id)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS contractor_face_reenroll_client_status_idx
  ON contractor_face_reenrollment_requests (client_id, status, requested_at DESC);
