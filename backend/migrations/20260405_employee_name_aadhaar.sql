-- Migration: Replace firstName + lastName with single 'name' (as per Aadhaar)
-- Date: 2026-04-05

-- Step 1: Add new 'name' column
ALTER TABLE employees ADD COLUMN IF NOT EXISTS name VARCHAR(250);

-- Step 2: Populate from existing data
UPDATE employees
SET name = TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
WHERE name IS NULL;

-- Step 3: Make it NOT NULL
ALTER TABLE employees ALTER COLUMN name SET NOT NULL;

-- Step 4: Drop old columns
ALTER TABLE employees DROP COLUMN IF EXISTS first_name;
ALTER TABLE employees DROP COLUMN IF EXISTS last_name;
