-- 20260502: scheduled employment dimension on contractor + minimum-wage master.
-- Captures the labour-law "schedule of employment" each contractor operates under,
-- and lets the minimum-wage master differentiate rates by schedule (in addition
-- to state + skill + effective date). New rates are typically uploaded twice a
-- year (April and October) but the schema enforces nothing on cadence; admins
-- simply insert a new row with the new effective_from date.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS scheduled_employment varchar(120) NULL;

ALTER TABLE minimum_wages
  ADD COLUMN IF NOT EXISTS scheduled_employment varchar(120) NULL;

-- Refresh lookup index to include schedule-of-employment.
DROP INDEX IF EXISTS idx_mw_state_skill_eff;
CREATE INDEX IF NOT EXISTS idx_mw_state_skill_sched_eff
  ON minimum_wages (state_code, skill_category, scheduled_employment, effective_from DESC);
