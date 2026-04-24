-- Migration: Add overtime/comp-off tracking
-- Date: 2026-03-23

-- 1. Add short-work reason and overtime classification to attendance_records
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS short_work_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS overtime_type VARCHAR(20) DEFAULT NULL;
  -- overtime_type: 'OT' (paid overtime for salary ≤ 21k) | 'COFF' (comp-off for salary > 21k)

COMMENT ON COLUMN attendance_records.short_work_reason IS 'Reason when worked_hours < 9; required for short days';
COMMENT ON COLUMN attendance_records.overtime_type IS 'OT = paid overtime (salary <= 21000), COFF = comp-off accrual (salary > 21000)';

-- 2. Comp-off ledger for tracking accrual and usage
CREATE TABLE IF NOT EXISTS comp_off_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  entry_date DATE NOT NULL,
  entry_type VARCHAR(10) NOT NULL CHECK (entry_type IN ('ACCRUAL', 'USED', 'LAPSED', 'ADJUSTMENT')),
  days NUMERIC(5,2) NOT NULL,  -- positive for accrual, negative for usage
  reason VARCHAR(30) NOT NULL,
  -- reason values: 'EXCESS_HOURS', 'WEEKLY_OFF_WORK', 'HOLIDAY_WORK', 'LEAVE_USED', 'MANUAL_ADJ', 'LAPSED'
  ref_attendance_id UUID REFERENCES attendance_records(id),
  ref_leave_id UUID DEFAULT NULL,
  remarks TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coff_ledger_employee ON comp_off_ledger(employee_id);
CREATE INDEX IF NOT EXISTS idx_coff_ledger_client ON comp_off_ledger(client_id);
CREATE INDEX IF NOT EXISTS idx_coff_ledger_date ON comp_off_ledger(entry_date);

-- 3. Add COMP_OFF as a leave_type in leave_balances if not exists
INSERT INTO leave_balances (id, employee_id, client_id, year, leave_type, opening, accrued, used, lapsed, available, created_at)
SELECT gen_random_uuid(), e.id, e.client_id, 2026, 'COMP_OFF', 0, 0, 0, 0, 0, NOW()
FROM employees e
WHERE e.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM leave_balances lb
    WHERE lb.employee_id = e.id AND lb.year = 2026 AND lb.leave_type = 'COMP_OFF'
  );
