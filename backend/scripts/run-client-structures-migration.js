const{Client}=require('pg');
(async()=>{
const c=new Client({host:process.env.DB_HOST,port:5432,user:process.env.DB_USER,password:process.env.DB_PASS,database:process.env.DB_NAME,ssl:{rejectUnauthorized:false}});
await c.connect();
console.log('connected');
var r;

// 1. payroll_client_structures
r=await c.query(`CREATE TABLE IF NOT EXISTS payroll_client_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  name varchar(120) NOT NULL,
  code varchar(60) NOT NULL,
  version int NOT NULL DEFAULT 1,
  effective_from date NOT NULL,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)`);
console.log('t1:'+r.command);

r=await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_client_structures_code_version ON payroll_client_structures (client_id, code, version)`);
console.log('i1a:'+r.command);

r=await c.query(`CREATE INDEX IF NOT EXISTS idx_client_structures_client ON payroll_client_structures (client_id)`);
console.log('i1b:'+r.command);

// 2. payroll_structure_components
r=await c.query(`CREATE TABLE IF NOT EXISTS payroll_structure_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES payroll_client_structures(id) ON DELETE CASCADE,
  code varchar(80) NOT NULL,
  name varchar(120) NOT NULL,
  label varchar(120) NOT NULL,
  component_type varchar(30) NOT NULL,
  calculation_method varchar(30) NOT NULL,
  display_order int NOT NULL DEFAULT 1,
  fixed_value numeric(12,4),
  percentage_value numeric(12,4),
  based_on varchar(80),
  formula text,
  round_rule varchar(20) NOT NULL DEFAULT 'NONE',
  taxable boolean NOT NULL DEFAULT true,
  statutory boolean NOT NULL DEFAULT false,
  is_visible_in_payslip boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true
)`);
console.log('t2:'+r.command);

r=await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_structure_components_code ON payroll_structure_components (structure_id, code)`);
console.log('i2a:'+r.command);

r=await c.query(`CREATE INDEX IF NOT EXISTS idx_structure_components_structure ON payroll_structure_components (structure_id)`);
console.log('i2b:'+r.command);

// 3. payroll_component_conditions
r=await c.query(`CREATE TABLE IF NOT EXISTS payroll_component_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id uuid NOT NULL REFERENCES payroll_structure_components(id) ON DELETE CASCADE,
  field_name varchar(80) NOT NULL,
  operator varchar(10) NOT NULL,
  field_value varchar(100) NOT NULL,
  action_type varchar(30) NOT NULL,
  action_value varchar(200),
  message varchar(255)
)`);
console.log('t3:'+r.command);

r=await c.query(`CREATE INDEX IF NOT EXISTS idx_component_conditions_component ON payroll_component_conditions (component_id)`);
console.log('i3:'+r.command);

// 4. payroll_statutory_configs
r=await c.query(`CREATE TABLE IF NOT EXISTS payroll_statutory_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES payroll_client_structures(id) ON DELETE CASCADE,
  state_code varchar(10) NOT NULL,
  minimum_wage numeric(12,2),
  warn_if_gross_below_min_wage boolean NOT NULL DEFAULT true,
  enable_pt boolean NOT NULL DEFAULT true,
  enable_pf boolean NOT NULL DEFAULT true,
  enable_esi boolean NOT NULL DEFAULT true,
  pf_employee_rate numeric(8,4) NOT NULL DEFAULT 12,
  pf_wage_cap numeric(12,2) NOT NULL DEFAULT 15000,
  pf_apply_if_gross_above numeric(12,2),
  esi_employee_rate numeric(8,4) NOT NULL DEFAULT 0.75,
  esi_employer_rate numeric(8,4) NOT NULL DEFAULT 3.25,
  esi_gross_ceiling numeric(12,2) NOT NULL DEFAULT 21000,
  carry_forward_leave boolean NOT NULL DEFAULT true,
  monthly_paid_leave_accrual numeric(6,2) NOT NULL DEFAULT 1.5,
  attendance_bonus_amount numeric(12,2),
  attendance_bonus_if_lop_lte numeric(6,2)
)`);
console.log('t4:'+r.command);

r=await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_statutory_configs_structure_state ON payroll_statutory_configs (structure_id, state_code)`);
console.log('i4a:'+r.command);

r=await c.query(`CREATE INDEX IF NOT EXISTS idx_statutory_configs_structure ON payroll_statutory_configs (structure_id)`);
console.log('i4b:'+r.command);

console.log('ALL DONE');
await c.end();
})();
