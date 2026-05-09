-- Add exit_reason column to employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS exit_reason VARCHAR(500);

-- Create contractor_employees table
CREATE TABLE IF NOT EXISTS contractor_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES client_branches(id) ON DELETE CASCADE,
  contractor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(250) NOT NULL,
  date_of_birth DATE,
  gender VARCHAR(10),
  father_name VARCHAR(200),
  phone VARCHAR(20),
  email VARCHAR(200),
  aadhaar VARCHAR(20),
  pan VARCHAR(20),
  uan VARCHAR(30),
  esic VARCHAR(30),
  pf_applicable BOOLEAN DEFAULT false,
  esi_applicable BOOLEAN DEFAULT false,
  designation VARCHAR(120),
  department VARCHAR(120),
  date_of_joining DATE,
  date_of_exit DATE,
  exit_reason VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contractor_emp_client ON contractor_employees(client_id);
CREATE INDEX IF NOT EXISTS idx_contractor_emp_branch ON contractor_employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_contractor_emp_contractor ON contractor_employees(contractor_user_id);
CREATE INDEX IF NOT EXISTS idx_contractor_emp_active ON contractor_employees(is_active);
