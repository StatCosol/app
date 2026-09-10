-- ════════════════════════════════════════════════════════════════════════════
-- Effective dates for PT / LWF statutory slabs
-- ════════════════════════════════════════════════════════════════════════════
-- payroll_statutory_slabs had no period columns at all, and
-- StateSlabService.resolveAmount() took no date. A state's slab table could
-- therefore hold exactly one version of its rates:
--
--   * revising a rate mid-year meant overwriting the old rows, so reprocessing
--     an earlier month produced the NEW figure for a month it never applied to;
--   * keeping both versions side by side was worse — the band match returned
--     whichever row happened to sort first.
--
-- effective_from is backfilled from created_at, which is the only honest date
-- available for existing rows: it is when the rate entered the system, not
-- necessarily when the statute took effect. Rows predating this column are
-- therefore treated as having applied since they were entered, which matches
-- how they have actually been used.
--
-- effective_to stays NULL: every existing row is the current one for its band.
--
-- NOTE: nothing in this project runs backend/migrations automatically. The
-- matching boot patch in src/main.ts applies the same change on startup; this
-- file is the record of it and the path for a fresh database.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE payroll_statutory_slabs
  ADD COLUMN IF NOT EXISTS effective_from DATE;

ALTER TABLE payroll_statutory_slabs
  ADD COLUMN IF NOT EXISTS effective_to DATE;

UPDATE payroll_statutory_slabs
   SET effective_from = created_at::date
 WHERE effective_from IS NULL;

-- created_at is NOT NULL in practice, but a row that somehow lacks one must
-- still be selectable rather than silently dropping out of every lookup.
UPDATE payroll_statutory_slabs
   SET effective_from = DATE '1970-01-01'
 WHERE effective_from IS NULL;

ALTER TABLE payroll_statutory_slabs
  ALTER COLUMN effective_from SET NOT NULL;

-- Lookups filter on the period before matching a band.
CREATE INDEX IF NOT EXISTS IDX_PSS_EFFECTIVE
  ON payroll_statutory_slabs (client_id, state_code, component_code, effective_from);
