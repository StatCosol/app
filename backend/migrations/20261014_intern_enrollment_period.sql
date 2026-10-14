ALTER TABLE employees ADD COLUMN IF NOT EXISTS internship_start_date date;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS internship_end_date date;
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_employee_internship_period' AND conrelid = 'employees'::regclass) THEN
ALTER TABLE employees ADD CONSTRAINT chk_employee_internship_period CHECK (internship_start_date IS NULL OR internship_end_date IS NULL OR internship_end_date >= internship_start_date);
END IF;
END $$;
