-- Item #4b: Minimum-wage master.
-- Apply manually:
--   psql ... -f backend/migrations/20260501_minimum_wages.sql

CREATE TABLE IF NOT EXISTS minimum_wages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code      varchar(8)  NOT NULL,
  skill_category  varchar(20) NOT NULL,
  monthly_wage    numeric(12,2) NOT NULL,
  daily_wage      numeric(10,2) NULL,
  effective_from  date        NOT NULL,
  effective_to    date        NULL,
  source          varchar(255) NULL,
  notes           text        NULL,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_mw_skill CHECK (
    skill_category IN ('UNSKILLED','SEMI_SKILLED','SKILLED','HIGHLY_SKILLED')
  ),
  CONSTRAINT chk_mw_amounts CHECK (monthly_wage > 0)
);

CREATE INDEX IF NOT EXISTS idx_mw_state_skill_eff
  ON minimum_wages (state_code, skill_category, effective_from DESC);

-- Convenience: ensure no overlapping active rows for same (state, skill).
-- Not enforced via exclusion constraint to keep migration portable; rely on
-- application-level upsert via upsertWage().
