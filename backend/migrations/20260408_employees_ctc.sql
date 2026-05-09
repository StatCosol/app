-- Add CTC (Cost to Company) column to employees table
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS ctc NUMERIC(12,2);
