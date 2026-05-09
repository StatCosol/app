-- Item #9b: store the auditor slot allocation (in hours) on each scheduled audit.
-- The value is derived from the contractor's active headcount at scheduling time:
--   hc < 50            => 1 hour
--   50 <= hc <= 100    => 2 hours
--   hc > 100           => 3 hours
-- For non-contractor audit types the value stays NULL (auditor uses their own
-- slot in that case).

ALTER TABLE audit_schedules
    ADD COLUMN IF NOT EXISTS auditor_slot_hours NUMERIC(4, 2);

COMMENT ON COLUMN audit_schedules.auditor_slot_hours IS
    'Auditor time allocation in hours. Derived from contractor active headcount at the time the schedule was created (1h <50, 2h 50-100, 3h >100). NULL for non-contractor audits.';
