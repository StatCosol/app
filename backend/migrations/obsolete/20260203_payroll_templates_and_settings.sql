-- Migration: Add payroll template and settings tables
-- Date: 2026-02-03
-- Purpose: Create tables for payroll templates, client settings, and status history

-- 1) Payroll Templates (master template definitions)
CREATE TABLE IF NOT EXISTS public.payroll_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL UNIQUE,
  version int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Payroll Template Components (components in each template)
CREATE TABLE IF NOT EXISTS public.payroll_template_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL,
  code varchar(100) NOT NULL,
  label varchar(255) NOT NULL,
  type varchar(50) NOT NULL, -- 'EARNING' or 'DEDUCTION'
  input_type varchar(50) NULL,
  default_value float NULL,
  order_no int NOT NULL DEFAULT 0,
  is_taxable boolean NOT NULL DEFAULT false,
  is_statutory boolean NOT NULL DEFAULT false,
  formula_expression varchar(500) NULL,
  round_rule varchar(100) NULL,
  CONSTRAINT fk_ptc_template FOREIGN KEY (template_id) 
    REFERENCES public.payroll_templates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ptc_template ON public.payroll_template_components(template_id);

-- 3) Payroll Client Template Assignment (which template a client uses)
CREATE TABLE IF NOT EXISTS public.payroll_client_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  template_id uuid NOT NULL,
  effective_from date NOT NULL,
  effective_to date NULL,
  CONSTRAINT fk_pct_client FOREIGN KEY (client_id) 
    REFERENCES public.clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_pct_template FOREIGN KEY (template_id) 
    REFERENCES public.payroll_templates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pct_client ON public.payroll_client_template(client_id);
CREATE INDEX IF NOT EXISTS idx_pct_effective ON public.payroll_client_template(effective_from, effective_to);

-- 4) Payroll Client Settings (client-specific payroll configuration)
CREATE TABLE IF NOT EXISTS public.payroll_client_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_pcs_client FOREIGN KEY (client_id) 
    REFERENCES public.clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_pcs_updated_by FOREIGN KEY (updated_by) 
    REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pcs_client ON public.payroll_client_settings(client_id);

-- 5) Payroll Client Payslip Layout (custom payslip layout per client)
CREATE TABLE IF NOT EXISTS public.payroll_client_payslip_layout (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE,
  layout_json jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_pcpl_client FOREIGN KEY (client_id) 
    REFERENCES public.clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pcpl_client ON public.payroll_client_payslip_layout(client_id);

-- 6) Payroll Input Status History (audit trail for payroll input status changes)
CREATE TABLE IF NOT EXISTS public.payroll_input_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_input_id uuid NOT NULL,
  from_status varchar(50) NULL,
  to_status varchar(50) NOT NULL,
  changed_by_user_id uuid NOT NULL,
  remarks varchar(500) NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_pish_payroll_input FOREIGN KEY (payroll_input_id) 
    REFERENCES public.payroll_inputs(id) ON DELETE CASCADE,
  CONSTRAINT fk_pish_changed_by FOREIGN KEY (changed_by_user_id) 
    REFERENCES public.users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_pish_payroll_input ON public.payroll_input_status_history(payroll_input_id);
CREATE INDEX IF NOT EXISTS idx_pish_changed_by ON public.payroll_input_status_history(changed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_pish_changed_at ON public.payroll_input_status_history(changed_at);
