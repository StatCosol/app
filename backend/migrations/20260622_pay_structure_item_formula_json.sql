-- Add structured formula representation to salary structure items.
-- The text `formula` column remains the engine's source of truth (so the
-- evaluator does not need to change). `formula_json` is what the no-code
-- Visual Formula Builder UI reads/writes; on save the backend serializes
-- it back to a text expression and stores both side-by-side.
ALTER TABLE pay_salary_structure_items
  ADD COLUMN IF NOT EXISTS formula_json jsonb NULL;

COMMENT ON COLUMN pay_salary_structure_items.formula_json IS
  'Structured formula tree authored by the no-code Formula Builder. Serialized to the `formula` text column on save.';
