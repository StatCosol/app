-- Existing employees retain their data; required fields are enforced on new registrations.
ALTER TABLE contractor_employees ADD COLUMN IF NOT EXISTS bank_account varchar(40);
