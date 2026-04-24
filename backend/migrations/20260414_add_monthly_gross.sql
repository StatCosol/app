-- Add monthly_gross column to employees table
ALTER TABLE employees ADD COLUMN IF NOT EXISTS monthly_gross NUMERIC(12,2);
