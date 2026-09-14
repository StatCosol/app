-- Compensatory off (C-off) for contract workers who work on Sundays.
-- A lot is earned when the branch marks Sundays worked as C-off at attendance
-- approval; usages record C-off days taken (AVAILED) or unused C-off paid as
-- double wages when it expires (CONVERTED). Balance = days - SUM(usages.days).
-- Also created at boot (src/main.ts) because migrations are not auto-applied.

CREATE TABLE IF NOT EXISTS contractor_comp_off_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  contractor_user_id uuid NOT NULL,
  employee_code varchar(50) NOT NULL,
  earned_period_month varchar(7) NOT NULL
    CHECK (earned_period_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  earned_on date NOT NULL,
  expires_on date NOT NULL,
  days numeric(5,2) NOT NULL CHECK (days > 0),
  source_batch_id uuid NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contractor_comp_off_lots_worker
  ON contractor_comp_off_lots (client_id, contractor_user_id, branch_id, employee_code, expires_on);

CREATE TABLE IF NOT EXISTS contractor_comp_off_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES contractor_comp_off_lots(id) ON DELETE CASCADE,
  period_month varchar(7) NOT NULL
    CHECK (period_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  kind varchar(10) NOT NULL CHECK (kind IN ('AVAILED', 'CONVERTED')),
  days numeric(5,2) NOT NULL CHECK (days > 0),
  source_batch_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contractor_comp_off_usages_lot
  ON contractor_comp_off_usages (lot_id);
CREATE INDEX IF NOT EXISTS idx_contractor_comp_off_usages_period
  ON contractor_comp_off_usages (period_month);
