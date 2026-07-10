-- FaceDesk V2 web-initiated enrollment. A branch user picks an employee + kiosk
-- and creates a ticket; the kiosk polls for its PENDING ticket, opens the
-- enrollment screen, captures, and completes it. Attendance is held on that
-- device while a ticket is open. Idempotent.

CREATE TABLE IF NOT EXISTS facedesk_enroll_tickets (
  ticket_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid NOT NULL,
  branch_id      uuid,
  device_id      uuid NOT NULL,
  employee_id    uuid NOT NULL,
  employee_name  varchar(160),
  employee_code  varchar(60),
  status         varchar(20) NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','CAPTURING','COMPLETED','CANCELLED','EXPIRED')),
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  completed_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_fd_tickets_device ON facedesk_enroll_tickets(device_id, status);
CREATE INDEX IF NOT EXISTS idx_fd_tickets_client ON facedesk_enroll_tickets(client_id, status);
-- One open ticket per device at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fd_ticket_open_device
  ON facedesk_enroll_tickets(device_id)
  WHERE status IN ('PENDING','CAPTURING');
