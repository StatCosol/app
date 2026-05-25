-- Roadmap #7 / K10: per-employee shift definition consumed by
-- mobile-attendance.recordPunch() to flag early-IN / late-OUT and
-- compute OT eligibility.
--
-- Design notes
-- ------------
-- * Scoped to in-house employees only. Contractor attendance is
--   timesheet-based and uses a different policy surface.
-- * One active row per employee enforced via partial unique index.
-- * `start_time` may be greater than `end_time` to model overnight
--   shifts (e.g. 22:00 -> 06:00); the service computes window
--   crossing accordingly.
-- * Grace minutes are symmetric around the window; OT threshold is
--   the minutes worked past `end_time` required before a punch-OUT
--   is treated as overtime.
-- * Enforcement behaviour is controlled by env SHIFT_VALIDATION_MODE
--   (off | warn | enforce, default off). The table can be populated
--   ahead of enabling enforcement without any behaviour change.

CREATE TABLE IF NOT EXISTS attendance_shifts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          uuid NOT NULL,
  employee_id        uuid NOT NULL,
  start_time         time NOT NULL,
  end_time           time NOT NULL,
  grace_in_min       integer NOT NULL DEFAULT 15,
  grace_out_min      integer NOT NULL DEFAULT 15,
  ot_threshold_min   integer NOT NULL DEFAULT 30,
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_attendance_shifts_grace_in  CHECK (grace_in_min  >= 0 AND grace_in_min  <= 240),
  CONSTRAINT ck_attendance_shifts_grace_out CHECK (grace_out_min >= 0 AND grace_out_min <= 240),
  CONSTRAINT ck_attendance_shifts_ot        CHECK (ot_threshold_min >= 0 AND ot_threshold_min <= 480)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_attendance_shifts_active_employee
  ON attendance_shifts (employee_id) WHERE active;

CREATE INDEX IF NOT EXISTS ix_attendance_shifts_client
  ON attendance_shifts (client_id);
