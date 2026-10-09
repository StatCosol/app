-- Enrollment particulars used by employee statutory registers.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS education varchar(250);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS skill_category varchar(30);
