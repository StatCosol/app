-- 20260507_sales_leads.sql
-- Adds SALES role and the leads + lead_activities tables for the new
-- Business Development / Sales pipeline. Idempotent.

BEGIN;

-- 1. SALES role -----------------------------------------------------------
INSERT INTO roles (code, name, is_system)
VALUES ('SALES', 'Sales / Business Development', true)
ON CONFLICT (code) DO NOTHING;

-- 2. Lead pipeline enums --------------------------------------------------
DO $$ BEGIN
  CREATE TYPE lead_stage AS ENUM (
    'NEW',
    'CONTACTED',
    'QUALIFIED',
    'PROPOSAL_SENT',
    'NEGOTIATION',
    'AGREEMENT_SENT',
    'WON',
    'LOST',
    'ON_HOLD'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lead_source AS ENUM (
    'INBOUND',
    'REFERRAL',
    'OUTBOUND',
    'EVENT',
    'WEBSITE',
    'MARKETING',
    'PARTNER',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lead_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lead_activity_type AS ENUM (
    'CALL',
    'EMAIL',
    'WHATSAPP',
    'MEETING',
    'PROPOSAL',
    'AGREEMENT',
    'NOTE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lead_activity_outcome AS ENUM (
    'NO_ANSWER',
    'INTERESTED',
    'NOT_INTERESTED',
    'FOLLOW_UP',
    'PROPOSAL_SENT',
    'AGREEMENT_SIGNED',
    'DECLINED',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. leads table ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_no         varchar(40) UNIQUE,
  company_name    varchar(200) NOT NULL,
  contact_name    varchar(120),
  contact_email   varchar(200),
  contact_phone   varchar(40),
  designation     varchar(120),
  industry        varchar(120),
  state           varchar(80),
  city            varchar(120),
  employee_count  integer,
  source          lead_source NOT NULL DEFAULT 'OTHER',
  source_detail   varchar(200),
  stage           lead_stage NOT NULL DEFAULT 'NEW',
  priority        lead_priority NOT NULL DEFAULT 'MEDIUM',
  estimated_value numeric(14,2) DEFAULT 0,
  probability     smallint DEFAULT 20,
  expected_close_date date,
  next_followup_at timestamptz,
  last_activity_at timestamptz,
  description     text,
  notes           text,
  owner_user_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  converted_client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  converted_at    timestamptz,
  lost_reason     varchar(200),
  is_archived     boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_stage          ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_owner          ON leads(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_leads_next_followup  ON leads(next_followup_at);
CREATE INDEX IF NOT EXISTS idx_leads_created_at     ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_priority       ON leads(priority);

-- 4. lead_activities table ------------------------------------------------
CREATE TABLE IF NOT EXISTS lead_activities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  activity_type   lead_activity_type NOT NULL,
  outcome         lead_activity_outcome,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  next_followup_at timestamptz,
  duration_minutes integer,
  subject         varchar(200),
  notes           text,
  performed_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  attachment_url  varchar(500),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead       ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_occurred   ON lead_activities(occurred_at);
CREATE INDEX IF NOT EXISTS idx_lead_activities_performer  ON lead_activities(performed_by);
CREATE INDEX IF NOT EXISTS idx_lead_activities_type       ON lead_activities(activity_type);

-- 5. Trigger: update leads.updated_at + .last_activity_at on activity insert
CREATE OR REPLACE FUNCTION fn_lead_touch_on_activity() RETURNS trigger AS $$
BEGIN
  UPDATE leads
     SET last_activity_at = NEW.occurred_at,
         next_followup_at = COALESCE(NEW.next_followup_at, next_followup_at),
         updated_at       = now()
   WHERE id = NEW.lead_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lead_touch_on_activity ON lead_activities;
CREATE TRIGGER trg_lead_touch_on_activity
  AFTER INSERT ON lead_activities
  FOR EACH ROW EXECUTE FUNCTION fn_lead_touch_on_activity();

-- 6. updated_at autotouch on leads
CREATE OR REPLACE FUNCTION fn_leads_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leads_set_updated_at ON leads;
CREATE TRIGGER trg_leads_set_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION fn_leads_set_updated_at();

COMMIT;
