BEGIN;

-- -------------------------------------------------------------------
-- 0) Extensions
-- -------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -------------------------------------------------------------------
-- 1) Role seeds (safe)
-- -------------------------------------------------------------------
INSERT INTO roles (code, name)
VALUES
  ('PAYROLL','Payroll'),
  ('PF_TEAM','PF/ESI Helpdesk')
ON CONFLICT (code) DO NOTHING;

-- -------------------------------------------------------------------
-- 2) PAYROLL → CLIENT ASSIGNMENTS
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payroll_client_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_user_id uuid NOT NULL,
  client_id uuid NOT NULL,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date NULL,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE/INACTIVE
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_pca_payroll_user') THEN
    ALTER TABLE public.payroll_client_assignments
      ADD CONSTRAINT fk_pca_payroll_user
      FOREIGN KEY (payroll_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_pca_client') THEN
    ALTER TABLE public.payroll_client_assignments
      ADD CONSTRAINT fk_pca_client
      FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Prevent duplicate active assignment
CREATE UNIQUE INDEX IF NOT EXISTS uq_pca_active
ON public.payroll_client_assignments (payroll_user_id, client_id)
WHERE end_date IS NULL AND status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_pca_client ON public.payroll_client_assignments (client_id);
CREATE INDEX IF NOT EXISTS idx_pca_payroll_user ON public.payroll_client_assignments (payroll_user_id);

-- -------------------------------------------------------------------
-- 3) PAYROLL INPUTS (Client uploads monthly inputs)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payroll_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  branch_id uuid NULL,

  period_year int NOT NULL,
  period_month int NOT NULL,

  title varchar(200) NOT NULL,
  notes text NULL,

  status varchar(30) NOT NULL DEFAULT 'SUBMITTED',
  -- SUBMITTED | NEEDS_CLARIFICATION | RESUBMITTED | ACCEPTED | FINALIZED

  submitted_by_user_id uuid NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_pi_client') THEN
    ALTER TABLE public.payroll_inputs
      ADD CONSTRAINT fk_pi_client
      FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_pi_branch') THEN
    ALTER TABLE public.payroll_inputs
      ADD CONSTRAINT fk_pi_branch
      FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_pi_submitted_by') THEN
    ALTER TABLE public.payroll_inputs
      ADD CONSTRAINT fk_pi_submitted_by
      FOREIGN KEY (submitted_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- One input submission per client + branch(or null) + month/year
CREATE UNIQUE INDEX IF NOT EXISTS uq_pi_period
ON public.payroll_inputs (
  client_id,
  COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
  period_year,
  period_month
);

CREATE INDEX IF NOT EXISTS idx_pi_client ON public.payroll_inputs (client_id);
CREATE INDEX IF NOT EXISTS idx_pi_branch ON public.payroll_inputs (branch_id);
CREATE INDEX IF NOT EXISTS idx_pi_status ON public.payroll_inputs (status);

-- -------------------------------------------------------------------
-- 4) PAYROLL INPUT FILES (multiple attachments)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payroll_input_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_input_id uuid NOT NULL,

  doc_type varchar(80) NULL, -- Attendance/OT/Incentive/etc.

  file_name varchar(300) NOT NULL,
  file_path text NOT NULL,
  file_type varchar(120) NOT NULL,
  file_size bigint NOT NULL,

  uploaded_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_pif_input') THEN
    ALTER TABLE public.payroll_input_files
      ADD CONSTRAINT fk_pif_input
      FOREIGN KEY (payroll_input_id) REFERENCES public.payroll_inputs(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_pif_uploaded_by') THEN
    ALTER TABLE public.payroll_input_files
      ADD CONSTRAINT fk_pif_uploaded_by
      FOREIGN KEY (uploaded_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pif_input ON public.payroll_input_files (payroll_input_id);

-- -------------------------------------------------------------------
-- 5) REGISTERS & RECORDS (Payroll uploads final statutory outputs)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.registers_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  client_id uuid NOT NULL,
  branch_id uuid NULL,

  payroll_input_id uuid NULL,

  category varchar(20) NOT NULL, -- REGISTER | RECORD
  title varchar(200) NOT NULL,

  period_year int NULL,
  period_month int NULL,

  prepared_by_user_id uuid NOT NULL,

  file_name varchar(255) NOT NULL,
  file_path text NOT NULL,
  file_type varchar(120) NOT NULL,
  file_size bigint NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_rr_client') THEN
    ALTER TABLE public.registers_records
      ADD CONSTRAINT fk_rr_client
      FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_rr_branch') THEN
    ALTER TABLE public.registers_records
      ADD CONSTRAINT fk_rr_branch
      FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_rr_prepared_by') THEN
    ALTER TABLE public.registers_records
      ADD CONSTRAINT fk_rr_prepared_by
      FOREIGN KEY (prepared_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_rr_payroll_input') THEN
    ALTER TABLE public.registers_records
      ADD CONSTRAINT fk_rr_payroll_input
      FOREIGN KEY (payroll_input_id) REFERENCES public.payroll_inputs(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Enforce one register/record per client+branch+month+category (NULL-safe)
CREATE UNIQUE INDEX IF NOT EXISTS uq_rr_period_cat
ON public.registers_records (
  client_id,
  COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(period_year, 0),
  COALESCE(period_month, 0),
  category
);

CREATE INDEX IF NOT EXISTS idx_rr_client ON public.registers_records (client_id);
CREATE INDEX IF NOT EXISTS idx_rr_period ON public.registers_records (period_year, period_month);

-- -------------------------------------------------------------------
-- 6) CONTRACK: CONTRACTOR DOCUMENTS (Docs & Audit responses only)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contractor_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  contractor_id uuid NOT NULL,     -- contractor user id (users.id)
  client_id uuid NOT NULL,
  branch_id uuid NULL,

  doc_type varchar(80) NOT NULL,
  title varchar(200) NULL,

  audit_id uuid NULL,
  observation_id uuid NULL,

  file_name varchar(255) NOT NULL,
  file_path text NOT NULL,
  file_type varchar(120) NOT NULL,
  file_size bigint NOT NULL,

  uploaded_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_cd_contractor_user') THEN
    ALTER TABLE public.contractor_documents
      ADD CONSTRAINT fk_cd_contractor_user
      FOREIGN KEY (contractor_id) REFERENCES public.users(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_cd_client') THEN
    ALTER TABLE public.contractor_documents
      ADD CONSTRAINT fk_cd_client
      FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_cd_branch') THEN
    ALTER TABLE public.contractor_documents
      ADD CONSTRAINT fk_cd_branch
      FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_cd_uploaded_by') THEN
    ALTER TABLE public.contractor_documents
      ADD CONSTRAINT fk_cd_uploaded_by
      FOREIGN KEY (uploaded_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;
  END IF;

  -- Optional (enable if these tables exist in your DB)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='audits') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_cd_audit') THEN
      ALTER TABLE public.contractor_documents
        ADD CONSTRAINT fk_cd_audit
        FOREIGN KEY (audit_id) REFERENCES public.audits(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='audit_observations') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_cd_observation') THEN
      ALTER TABLE public.contractor_documents
        ADD CONSTRAINT fk_cd_observation
        FOREIGN KEY (observation_id) REFERENCES public.audit_observations(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Indexes (non-duplicated, consistent)
CREATE INDEX IF NOT EXISTS idx_cd_contractor_id ON public.contractor_documents (contractor_id);
CREATE INDEX IF NOT EXISTS idx_cd_client_id     ON public.contractor_documents (client_id);
CREATE INDEX IF NOT EXISTS idx_cd_branch_id     ON public.contractor_documents (branch_id);
CREATE INDEX IF NOT EXISTS idx_cd_audit_id      ON public.contractor_documents (audit_id);
CREATE INDEX IF NOT EXISTS idx_cd_observation_id ON public.contractor_documents (observation_id);
CREATE INDEX IF NOT EXISTS idx_cd_uploaded_by_user_id ON public.contractor_documents (uploaded_by_user_id);
CREATE INDEX IF NOT EXISTS idx_cd_created_at    ON public.contractor_documents (created_at);

-- -------------------------------------------------------------------
-- 7) PF / ESI HELPDESK (Tickets + Messages)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.helpdesk_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  category varchar(40) NOT NULL,
  sub_category varchar(80) NULL,

  client_id uuid NOT NULL,
  branch_id uuid NULL,

  employee_ref varchar(80) NULL,

  priority varchar(20) NOT NULL DEFAULT 'NORMAL',
  status varchar(30) NOT NULL DEFAULT 'OPEN',

  description text NOT NULL,

  created_by_user_id uuid NOT NULL,
  assigned_to_user_id uuid NULL,

  sla_due_at timestamptz NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_ht_client') THEN
    ALTER TABLE public.helpdesk_tickets
      ADD CONSTRAINT fk_ht_client
      FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_ht_branch') THEN
    ALTER TABLE public.helpdesk_tickets
      ADD CONSTRAINT fk_ht_branch
      FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_ht_created_by') THEN
    ALTER TABLE public.helpdesk_tickets
      ADD CONSTRAINT fk_ht_created_by
      FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_ht_assigned_to') THEN
    ALTER TABLE public.helpdesk_tickets
      ADD CONSTRAINT fk_ht_assigned_to
      FOREIGN KEY (assigned_to_user_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ht_client ON public.helpdesk_tickets (client_id);
CREATE INDEX IF NOT EXISTS idx_ht_status ON public.helpdesk_tickets (status);
CREATE INDEX IF NOT EXISTS idx_ht_sla ON public.helpdesk_tickets (sla_due_at);

CREATE TABLE IF NOT EXISTS public.helpdesk_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  sender_user_id uuid NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_hm_ticket') THEN
    ALTER TABLE public.helpdesk_messages
      ADD CONSTRAINT fk_hm_ticket
      FOREIGN KEY (ticket_id) REFERENCES public.helpdesk_tickets(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_hm_sender') THEN
    ALTER TABLE public.helpdesk_messages
      ADD CONSTRAINT fk_hm_sender
      FOREIGN KEY (sender_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hm_ticket ON public.helpdesk_messages (ticket_id);

CREATE TABLE IF NOT EXISTS public.helpdesk_message_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,

  file_name varchar(255) NOT NULL,
  file_path text NOT NULL,
  file_type varchar(120) NOT NULL,
  file_size bigint NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_hmf_message') THEN
    ALTER TABLE public.helpdesk_message_files
      ADD CONSTRAINT fk_hmf_message
      FOREIGN KEY (message_id) REFERENCES public.helpdesk_messages(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hmf_message ON public.helpdesk_message_files (message_id);

COMMIT;
