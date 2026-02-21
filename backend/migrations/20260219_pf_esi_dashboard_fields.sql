-- PF/ESI dashboard support fields
ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS pf_applicable BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS pf_registered BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS pf_applicable_from DATE NULL,
    ADD COLUMN IF NOT EXISTS esi_applicable BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS esi_registered BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS esi_applicable_from DATE NULL;

-- Helpful indexes for dashboard filters
CREATE INDEX IF NOT EXISTS idx_employees_pf_status
    ON employees (client_id, branch_id, pf_applicable, pf_registered);
CREATE INDEX IF NOT EXISTS idx_employees_esi_status
    ON employees (client_id, branch_id, esi_applicable, esi_registered);
