-- Add missing columns to pay_calc_traces (entity has them but CREATE TABLE did not)
ALTER TABLE pay_calc_traces
  ADD COLUMN IF NOT EXISTS structure_id UUID,
  ADD COLUMN IF NOT EXISTS rule_set_id  UUID;
