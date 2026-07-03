ALTER TABLE payroll_fnf ADD COLUMN IF NOT EXISTS manual_override boolean NOT NULL DEFAULT false;
ALTER TABLE payroll_fnf ALTER COLUMN reason TYPE varchar(500);
