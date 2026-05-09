-- 20260505_leave_register_pl_sl_columns.sql
-- Replace single "Earned Leave Balance" column in all leave registers
-- with a PL / SL split: PL Earned, PL Availed, PL Balance, SL Availed, SL Balance.
-- Idempotent: only acts on templates that still have the legacy `el_balance` key.

DO $$
DECLARE
  rec RECORD;
  new_cols jsonb;
  elem jsonb;
  pl_sl_block jsonb := '[
    {"key":"pl_earned",  "header":"PL Earned",  "source":"COMP:EL_ACCRUED", "width":10},
    {"key":"pl_availed", "header":"PL Availed", "source":"COMP:PL_DAYS",    "width":10},
    {"key":"pl_balance", "header":"PL Balance", "source":"COMP:EL_BALANCE", "width":10},
    {"key":"sl_availed", "header":"SL Availed", "source":"COMP:SL_DAYS",    "width":10},
    {"key":"sl_balance", "header":"SL Balance", "source":"COMP:SL_BALANCE", "width":10}
  ]'::jsonb;
BEGIN
  FOR rec IN
    SELECT id, column_definitions
    FROM register_templates
    WHERE register_type IN ('LEAVE_REGISTER','LEAVE_BOOK','SHOPS_LEAVE_REGISTER')
      AND column_definitions @> '[{"key":"el_balance"}]'::jsonb
  LOOP
    new_cols := '[]'::jsonb;
    FOR elem IN SELECT * FROM jsonb_array_elements(rec.column_definitions)
    LOOP
      IF elem->>'key' = 'el_balance' THEN
        new_cols := new_cols || pl_sl_block;
      ELSE
        new_cols := new_cols || jsonb_build_array(elem);
      END IF;
    END LOOP;
    UPDATE register_templates
    SET column_definitions = new_cols
    WHERE id = rec.id;
  END LOOP;
END $$;
