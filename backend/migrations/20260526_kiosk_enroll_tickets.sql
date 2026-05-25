-- Kiosk-supervised enrollment tickets.
--
-- A branch / client user creates a ticket targeting one KIOSK-mode device + one
-- employee (or contractor employee). The kiosk polls for active tickets for its
-- own device, captures 5 live frames, computes a 192-d MobileFaceNet embedding
-- on-device, and submits it back. The ticket is single-use and time-boxed.

CREATE TABLE IF NOT EXISTS kiosk_enroll_tickets (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                uuid NOT NULL,
  branch_id                uuid,
  device_id                uuid NOT NULL,
  subject_type             varchar(20) NOT NULL CHECK (subject_type IN ('EMPLOYEE','CONTRACTOR')),
  employee_id              uuid,
  contractor_employee_id   uuid,
  subject_name             varchar(250) NOT NULL,
  subject_code             varchar(50),
  consent_given            boolean NOT NULL DEFAULT false,
  status                   varchar(20) NOT NULL DEFAULT 'PENDING'
                              CHECK (status IN ('PENDING','COMPLETED','CANCELLED','EXPIRED')),
  created_by               uuid NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  expires_at               timestamptz NOT NULL,
  completed_at             timestamptz,
  cancelled_at             timestamptz,
  cancelled_by             uuid,
  embedding_model          varchar(40),
  match_score_self         numeric,
  notes                    text,
  CONSTRAINT kiosk_enroll_tickets_subject_xor CHECK (
    (subject_type = 'EMPLOYEE'   AND employee_id IS NOT NULL AND contractor_employee_id IS NULL) OR
    (subject_type = 'CONTRACTOR' AND contractor_employee_id IS NOT NULL AND employee_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_kiosk_enroll_tickets_device_status
  ON kiosk_enroll_tickets (device_id, status);
CREATE INDEX IF NOT EXISTS idx_kiosk_enroll_tickets_client
  ON kiosk_enroll_tickets (client_id, status, created_at DESC);

-- Only one pending ticket per device at a time (avoids racing the kiosk).
CREATE UNIQUE INDEX IF NOT EXISTS uq_kiosk_enroll_tickets_one_pending_per_device
  ON kiosk_enroll_tickets (device_id)
  WHERE status = 'PENDING';
